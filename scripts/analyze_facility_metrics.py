#!/usr/bin/env python3
"""
Analyze facility_metrics table: shape, duplicates, missing data, 15-min cadence, value sanity.
Reads DATABASE_URL from api/local.settings.json (or env). Writes report to facility_metrics_analysis_report.md
"""
import json
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("Run: pip install -r scripts/requirements.txt")
    sys.exit(1)

# Project root = parent of scripts/
ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "api" / "local.settings.json"
REPORT_PATH = Path(__file__).resolve().parent / "facility_metrics_analysis_report.md"


def get_connection_string():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return (data.get("Values") or {}).get("DATABASE_URL") or ""
    return ""


def run_query(conn, sql, params=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params or ())
        return cur.fetchall()


def run_one(conn, sql, params=None):
    rows = run_query(conn, sql, params)
    return rows[0] if rows else None


def main():
    url = get_connection_string()
    if not url:
        print("ERROR: DATABASE_URL not set. Create api/local.settings.json with Values.DATABASE_URL or set env.")
        sys.exit(1)

    conn = psycopg2.connect(url)
    lines = []

    def out(s=""):
        lines.append(s)

    out("# facility_metrics – Data Quality Analysis Report")
    out()
    out("Table: `facility_metrics` (metrics per facility every 15 minutes: discharges, admissions, births, icu, total census)")
    out()

    # 1. Basic counts and schema
    row = run_one(conn, "SELECT COUNT(*) AS n FROM facility_metrics")
    total = row["n"] if row else 0
    out("## 1. Volume & schema")
    out(f"- **Total rows:** {total:,}")
    if total == 0:
        out("- No data in table. Exiting.")
        with open(REPORT_PATH, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        conn.close()
        return

    cols = run_query(conn, """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'facility_metrics'
        ORDER BY ordinal_position
    """)
    out("- **Columns:** " + ", ".join(f"{c['column_name']} ({c['data_type']})" for c in cols))
    out()

    # 2. Distinct dimensions
    out("## 2. Dimensions")
    facilities = run_one(conn, "SELECT COUNT(DISTINCT facility_id) AS n FROM facility_metrics")["n"]
    metrics = run_query(conn, "SELECT DISTINCT metric FROM facility_metrics ORDER BY metric")
    metric_names = [m["metric"] for m in metrics]
    out(f"- **Distinct facility_id:** {facilities}")
    out(f"- **Distinct metric names:** {len(metric_names)}")
    out("  - " + ", ".join(repr(m) for m in metric_names))
    out()

    # 3. Date range and 15-min cadence
    out("## 3. Time range & 15-minute cadence")
    dr = run_one(conn, """
        SELECT
            MIN(source_update_date) AS min_ts,
            MAX(source_update_date) AS max_ts,
            COUNT(DISTINCT source_update_date) AS distinct_ts
        FROM facility_metrics
    """)
    min_ts = dr["min_ts"]
    max_ts = dr["max_ts"]
    distinct_ts = dr["distinct_ts"]
    out(f"- **Earliest source_update_date:** {min_ts}")
    out(f"- **Latest source_update_date:** {max_ts}")
    out(f"- **Distinct timestamps:** {distinct_ts:,}")

    # Expected 15-min slots per day = 96; sample one facility+metric to check spacing
    spacing = run_query(conn, """
        WITH ordered AS (
            SELECT facility_id, metric, source_update_date,
                   source_update_date - LAG(source_update_date) OVER (PARTITION BY facility_id, metric ORDER BY source_update_date) AS gap
            FROM facility_metrics
        )
        SELECT gap, COUNT(*) AS cnt
        FROM ordered
        WHERE gap IS NOT NULL
        GROUP BY gap
        ORDER BY cnt DESC
        LIMIT 15
    """)
    out("- **Top time gaps (same facility_id + metric):**")
    for s in spacing:
        out(f"  - {s['gap']}: {s['cnt']:,} occurrences")
    out()

    # 4. Duplicates: same (facility_id, metric, source_update_date)
    out("## 4. Duplicates (same facility_id, metric, source_update_date)")
    dup = run_one(conn, """
        SELECT COUNT(*) AS n
        FROM (
            SELECT facility_id, metric, source_update_date, COUNT(*) AS c
            FROM facility_metrics
            GROUP BY facility_id, metric, source_update_date
            HAVING COUNT(*) > 1
        ) x
    """)
    dup_count = dup["n"] if dup else 0
    out(f"- **Number of (facility_id, metric, source_update_date) groups with >1 row:** {dup_count}")

    if dup_count > 0:
        dup_sample = run_query(conn, """
            SELECT facility_id, metric, source_update_date, COUNT(*) AS cnt
            FROM facility_metrics
            GROUP BY facility_id, metric, source_update_date
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
            LIMIT 10
        """)
        out("- **Sample duplicate groups (max 10):**")
        for r in dup_sample:
            out(f"  - facility_id={r['facility_id']}, metric={r['metric']!r}, ts={r['source_update_date']} -> {r['cnt']} rows")
    out()

    # 5. Nulls and missing
    out("## 5. Nulls & missing values")
    for col in ["id", "facility_id", "metric", "source_update_date", "metric_value"]:
        n = run_one(conn, f"SELECT COUNT(*) AS n FROM facility_metrics WHERE {col} IS NULL")
        out(f"- **Nulls in `{col}`:** {n['n']:,}")
    out()

    # 6. metric_value sanity (numeric, non-negative where applicable)
    out("## 6. metric_value sanity")
    # If metric_value is numeric type, all non-null are "numeric"
    try:
        non_numeric = run_one(conn, """
            SELECT COUNT(*) AS n FROM facility_metrics
            WHERE metric_value IS NOT NULL AND metric_value::text !~ '^\-?[0-9]+\.?[0-9]*$'
        """)
        non_numeric_count = non_numeric["n"] if non_numeric else 0
    except Exception:
        non_numeric_count = "N/A"
    try:
        neg = run_one(conn, """
            SELECT COUNT(*) AS n FROM facility_metrics
            WHERE metric_value IS NOT NULL AND CAST(metric_value AS NUMERIC) < 0
        """)
        neg_count = neg["n"] if neg else 0
    except Exception:
        neg_count = "N/A (metric_value may not be numeric)"
    out(f"- **Rows where metric_value is not numeric:** {non_numeric_count:,}" if isinstance(non_numeric_count, int) else f"- **Rows where metric_value is not numeric:** {non_numeric_count}")
    out(f"- **Rows with metric_value < 0:** {neg_count}")
    out()

    # 7. Coverage: facilities × metrics × time
    out("## 7. Coverage (facility × metric × time)")
    # Expected metrics per facility per timestamp (if every 15 min and all metrics reported)
    cov = run_query(conn, """
        SELECT facility_id, metric,
               COUNT(*) AS row_count,
               MIN(source_update_date) AS first_ts,
               MAX(source_update_date) AS last_ts,
               COUNT(DISTINCT source_update_date) AS distinct_ts
        FROM facility_metrics
        GROUP BY facility_id, metric
        ORDER BY facility_id, metric
    """)
    out(f"- **Total (facility_id, metric) combinations:** {len(cov)}")
    if cov:
        row_counts = [r["row_count"] for r in cov]
        distinct_ts = [r["distinct_ts"] for r in cov]
        out(f"- **Row count per (facility, metric):** min={min(row_counts)}, max={max(row_counts)}, avg={sum(row_counts)/len(row_counts):.1f}")
        out(f"- **Distinct timestamps per (facility, metric):** min={min(distinct_ts)}, max={max(distinct_ts)}")
    out()

    # 8. Summary / weirdness
    out("## 8. Summary & potential issues")
    issues = []
    if dup_count > 0:
        issues.append(f"Duplicate (facility_id, metric, source_update_date): {dup_count} groups have >1 row.")
    if total > 0 and distinct_ts == 0:
        issues.append("No distinct timestamps despite rows – check source_update_date.")
    null_fid = run_one(conn, "SELECT COUNT(*) AS n FROM facility_metrics WHERE facility_id IS NULL")["n"]
    null_metric = run_one(conn, "SELECT COUNT(*) AS n FROM facility_metrics WHERE metric IS NULL OR TRIM(metric) = ''")["n"]
    if null_fid:
        issues.append(f"Rows with NULL facility_id: {null_fid}.")
    if null_metric:
        issues.append(f"Rows with NULL or empty metric: {null_metric}.")
    if isinstance(non_numeric_count, int) and non_numeric_count > 0:
        issues.append(f"Non-numeric metric_value: {non_numeric_count} rows.")
    if not issues:
        out("- No major issues detected. Duplicates and nulls are within expectations.")
    else:
        for i in issues:
            out(f"- {i}")
    out()
    out("---")
    out(f"*Report generated by `scripts/analyze_facility_metrics.py`*")

    conn.close()

    report_text = "\n".join(lines)
    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        f.write(report_text)
    try:
        print(report_text)
    except UnicodeEncodeError:
        print(report_text.encode("utf-8", errors="replace").decode("ascii", errors="replace"))
    print(f"\nReport written to: {REPORT_PATH}")


if __name__ == "__main__":
    main()
