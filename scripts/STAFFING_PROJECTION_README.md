# Staffing projection using Kaggle data

The script `staffing_projection.py` uses the [Kaggle dataset **Capacity of Hospitals Bed**](https://www.kaggle.com/datasets/endernel/capacity-of-hospitals-bed) to derive staffing ratios, then applies them to your **facility_metrics** census and ICU data to project staffing (FTE).

## Setup

1. **Python deps** (from repo root or `scripts/`):
   ```bash
   pip install -r scripts/requirements.txt
   ```

2. **Kaggle API** (for download):
   - Create a Kaggle account and go to [Account → Create New API Token](https://www.kaggle.com/settings). This downloads `kaggle.json`.
   - Place it at `~/.kaggle/kaggle.json` (or set env `KAGGLE_USERNAME` and `KAGGLE_KEY`).

3. **Your DB** (for facility_metrics):
   - `api/local.settings.json` → `Values.DATABASE_URL`, or set env `DATABASE_URL`.

## Run

```bash
python scripts/staffing_projection.py
```

- Downloads the Kaggle dataset (cached after first run).
- Loads your latest census/ICU per facility from `facility_metrics`.
- Infers staffing ratios from the Kaggle data if it has staff/beds or staff/census columns; otherwise uses built-in default ratios.
- Writes:
  - **`scripts/staffing_projection_report.csv`** — per-facility projected FTE.
  - **`scripts/staffing_projection_report.md`** — short report and ratios used.

## Customizing ratios

If the Kaggle dataset has no staffing column, the script uses defaults (see top of `staffing_projection.py`):

- `DEFAULT_NURSE_FTE_PER_OCCUPIED_BED` (e.g. 0.25)
- `DEFAULT_ICU_FTE_PER_OCCUPIED_BED` (e.g. 0.5)

Edit those constants to match your organization’s benchmarks, or add a small config file and read from it.

## Using the Kaggle dataset directly (Python)

```python
import kagglehub

path = kagglehub.dataset_download("endernel/capacity-of-hospitals-bed")
print("Path to dataset files:", path)
# Then open files under path (e.g. CSV) with pandas or csv.
```

Dataset link: https://www.kaggle.com/datasets/endernel/capacity-of-hospitals-bed
