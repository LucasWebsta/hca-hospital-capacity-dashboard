#!/usr/bin/env python3
"""
Use Kaggle hospital bed capacity data to project staffing for our facility_metrics.

1. Downloads: endernel/capacity-of-hospitals-bed via kagglehub
2. Loads our facility_metrics (census, ICU, admissions, etc.) from the DB
3. Derives staffing ratios from Kaggle (e.g. staff per bed or per census) when
   staffing columns exist; otherwise uses configurable benchmark ratios
4. Applies ratios to our (current or forecast) census to produce staffing projections

Outputs: scripts/staffing_projection_report.csv and staffing_projection_report.md

Setup:
  pip install -r scripts/requirements.txt
  Set KAGGLE_USERNAME and KAGGLE_KEY in env (or ~/.kaggle/kaggle.json) for download.
  DATABASE_URL in api/local.settings.json or env for your data.
"""
from __future__ import annotations

import csv
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SETTINGS_PATH = ROOT / "api" / "local.settings.json"
OUTPUT_CSV = Path(__file__).resolve().parent / "staffing_projection_report.csv"
OUTPUT_MD = Path(__file__).resolve().parent / "staffing_projection_report.md"

# Fallback staffing ratios (when Kaggle has no staff column): approximate FTE per occupied bed
# Adjust to match your organization's benchmarks.
DEFAULT_NURSE_FTE_PER_OCCUPIED_BED = 0.25
DEFAULT_ICU_FTE_PER_OCCUPIED_BED = 0.5


def get_database_url():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    if SETTINGS_PATH.exists():
        with open(SETTINGS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return (data.get("Values") or {}).get("DATABASE_URL") or ""
    return ""


def download_kaggle_dataset():
    """Download endernel/capacity-of-hospitals-bed and return path to folder."""
    try:
        import kagglehub
    except ImportError:
        print("Install kagglehub: pip install kagglehub")
        sys.exit(1)
    path = kagglehub.dataset_download("endernel/capacity-of-hospitals-bed")
    return Path(str(path))


def list_csv_files(path: Path):
    return list(path.glob("**/*.csv"))


def infer_column_map(columns):
    """Map common column names to canonical names for beds, census, staff, date, facility."""
    col_lower = {c: c.lower().strip() for c in columns}
    mapping = {}
    for c in columns:
        l = col_lower[c]
        if "bed" in l and "staff" not in l and "total" in l or l in ("beds", "bed_count", "total_beds"):
            mapping["beds"] = c
        if "census" in l or l in ("patients", "occupancy_count", "occupied"):
            mapping["census"] = c
        if "staff" in l or "fte" in l or "nurse" in l or "worker" in l:
            mapping["staff"] = c
        if "date" in l or "time" in l or "day" in l:
            mapping["date"] = c
        if "hospital" in l or "facility" in l or "id" == l or "name" in l:
            mapping["facility"] = c
        if "icu" in l and ("bed" in l or "capacity" in l):
            mapping["icu_beds"] = c
    return mapping


def load_kaggle_csv(csv_path: Path):
    """Load first CSV and return (rows as list of dicts, column_mapping)."""
    import pandas as pd

    df = pd.read_csv(csv_path, nrows=5000)
    columns = list(df.columns)
    mapping = infer_column_map(columns)
    rows = df.to_dict("records")
    # Coerce numeric
    for r in rows:
        for k, v in r.items():
            if isinstance(v, (int, float)) and (v != v):  # NaN
                r[k] = None
    return rows, mapping, columns


def compute_kaggle_ratios(rows, mapping):
    """
    From Kaggle rows compute:
    - staff_per_bed (if staff and beds exist)
    - staff_per_census (if staff and census exist)
    Return dict with mean ratios and sample size.
    """
    staff_col = mapping.get("staff")
    beds_col = mapping.get("beds")
    census_col = mapping.get("census")

    ratios = {"staff_per_bed": None, "staff_per_census": None, "n_samples": 0}

    if not staff_col:
        return ratios

    pairs = []
    for r in rows:
        try:
            s = float(r.get(staff_col))
        except (TypeError, ValueError):
            continue
        if beds_col and r.get(beds_col) is not None:
            try:
                b = float(r[beds_col])
                if b > 0:
                    pairs.append(("bed", s / b))
            except (TypeError, ValueError):
                pass
        if census_col and r.get(census_col) is not None:
            try:
                c = float(r[census_col])
                if c > 0:
                    pairs.append(("census", s / c))
            except (TypeError, ValueError):
                pass

    if not pairs:
        return ratios

    bed_ratios = [x[1] for x in pairs if x[0] == "bed"]
    census_ratios = [x[1] for x in pairs if x[0] == "census"]
    if bed_ratios:
        ratios["staff_per_bed"] = sum(bed_ratios) / len(bed_ratios)
    if census_ratios:
        ratios["staff_per_census"] = sum(census_ratios) / len(census_ratios)
    ratios["n_samples"] = len(pairs)
    return ratios


def load_our_metrics(conn):
    """Load latest census and ICU per facility from facility_metrics (one row per facility)."""
    from psycopg2.extras import RealDictCursor

    sql = """
    WITH latest AS (
      SELECT facility_id, metric, metric_value,
             ROW_NUMBER() OVER (PARTITION BY facility_id, metric ORDER BY source_update_date DESC) AS rn
      FROM facility_metrics
      WHERE metric IN ('Total Census', 'ICU Occupancy', 'Admissions', 'Discharges')
    )
    SELECT facility_id, metric, metric_value
    FROM latest WHERE rn = 1
    """
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    # Pivot to one row per facility
    by_facility = {}
    for r in rows:
        fid = r["facility_id"]
        if fid not in by_facility:
            by_facility[fid] = {"facility_id": fid, "census": None, "icu": None, "admissions": None, "discharges": None}
        m = r["metric"]
        v = r["metric_value"]
        if m == "Total Census":
            by_facility[fid]["census"] = v
        elif m == "ICU Occupancy":
            by_facility[fid]["icu"] = v
        elif m == "Admissions":
            by_facility[fid]["admissions"] = v
        elif m == "Discharges":
            by_facility[fid]["discharges"] = v
    return list(by_facility.values())


def project_staffing(facilities_metrics, ratios, beds_by_facility=None):
    """
    Apply ratios to our census to get projected FTE.
    beds_by_facility: optional dict facility_id -> total_beds (from facilities table or constant).
    """
    staff_per_bed = ratios.get("staff_per_bed")
    staff_per_census = ratios.get("staff_per_census")

    if staff_per_bed is None:
        staff_per_bed = DEFAULT_NURSE_FTE_PER_OCCUPIED_BED
    if staff_per_census is None:
        staff_per_census = staff_per_bed  # assume 1:1 bed occupancy for default

    results = []
    for f in facilities_metrics:
        fid = f["facility_id"]
        census = f.get("census") or 0
        icu = f.get("icu") or 0
        beds = (beds_by_facility or {}).get(fid)

        # Project general nursing FTE from census (occupied beds)
        general_census = max(0, census - icu) if census is not None else 0
        if census is not None and census > 0:
            projected_general_fte = census * staff_per_census
        else:
            projected_general_fte = None

        # ICU often uses higher ratio
        projected_icu_fte = (icu * DEFAULT_ICU_FTE_PER_OCCUPIED_BED) if (icu is not None and icu > 0) else None
        total_fte = (projected_general_fte or 0) + (projected_icu_fte or 0) if (projected_general_fte or projected_icu_fte) else None

        results.append({
            "facility_id": fid,
            "census": census,
            "icu": icu,
            "projected_general_fte": round(projected_general_fte, 1) if projected_general_fte is not None else None,
            "projected_icu_fte": round(projected_icu_fte, 1) if projected_icu_fte is not None else None,
            "projected_total_fte": round(total_fte, 1) if total_fte is not None else None,
        })
    return results


def write_csv(rows, path):
    if not rows:
        return
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)


def write_md_report(kaggle_path, kaggle_columns, kaggle_mapping, kaggle_ratios, projection_rows, output_md_path):
    lines = [
        "# Staffing Projection Report",
        "",
        "Uses Kaggle dataset `endernel/capacity-of-hospitals-bed` to derive staffing ratios, then applies them to your facility_metrics census/ICU data.",
        "",
        "## 1. Kaggle data",
        f"- **Path:** `{kaggle_path}`",
        f"- **Columns seen:** " + ", ".join(kaggle_columns),
        "",
    ]
    if kaggle_mapping:
        lines.append("- **Inferred mapping:** " + json.dumps(kaggle_mapping))
    sb = kaggle_ratios.get("staff_per_bed")
    sc = kaggle_ratios.get("staff_per_census")
    lines.extend([
        "",
        "## 2. Ratios used",
        f"- **staff_per_bed:** " + (f"{sb} (from Kaggle)" if sb is not None else f"{DEFAULT_NURSE_FTE_PER_OCCUPIED_BED} (default)"),
        f"- **staff_per_census:** " + (f"{sc} (from Kaggle)" if sc is not None else "default"),
        f"- **n_samples from Kaggle:** {kaggle_ratios.get('n_samples', 0)}",
        "",
        "## 3. Projected staffing (by facility)",
        "",
        "| facility_id | census | icu | projected_general_fte | projected_icu_fte | projected_total_fte |",
        "|-------------|--------|-----|------------------------|-------------------|---------------------|",
    ])
    for r in projection_rows:
        lines.append(
            f"| {r['facility_id']} | {r['census'] or ''} | {r['icu'] or ''} | "
            f"{r['projected_general_fte'] or ''} | {r['projected_icu_fte'] or ''} | {r['projected_total_fte'] or ''} |"
        )
    lines.extend(["", "---", "*Generated by `scripts/staffing_projection.py`*"])
    with open(output_md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        print("Run: pip install -r scripts/requirements.txt")
        sys.exit(1)

    print("Downloading Kaggle dataset endernel/capacity-of-hospitals-bed ...")
    kaggle_path = download_kaggle_dataset()
    print("Path to dataset files:", kaggle_path)

    csv_files = list_csv_files(kaggle_path)
    if not csv_files:
        print("No CSV files found under", kaggle_path)
        kaggle_rows, kaggle_mapping, kaggle_columns = [], {}, []
    else:
        first_csv = csv_files[0]
        print("Loading", first_csv.name, "...")
        try:
            import pandas as pd
        except ImportError:
            print("pip install pandas")
            sys.exit(1)
        kaggle_rows, kaggle_mapping, kaggle_columns = load_kaggle_csv(first_csv)
        print("Columns:", kaggle_columns)
        print("Inferred mapping:", kaggle_mapping)

    kaggle_ratios = compute_kaggle_ratios(kaggle_rows, kaggle_mapping)
    print("Ratios from Kaggle:", kaggle_ratios)

    db_url = get_database_url()
    if not db_url:
        print("DATABASE_URL not set. Cannot load your facility_metrics.")
        print("Create api/local.settings.json with Values.DATABASE_URL or set env.")
        projection_rows = []
    else:
        conn = psycopg2.connect(db_url)
        facilities_metrics = load_our_metrics(conn)
        conn.close()
        print("Loaded", len(facilities_metrics), "facilities from facility_metrics")
        projection_rows = project_staffing(facilities_metrics, kaggle_ratios)
        write_csv(projection_rows, OUTPUT_CSV)
        print("Wrote", OUTPUT_CSV)

    write_md_report(
        str(kaggle_path),
        kaggle_columns,
        kaggle_mapping,
        kaggle_ratios,
        projection_rows,
        OUTPUT_MD,
    )
    print("Wrote", OUTPUT_MD)


if __name__ == "__main__":
    main()
