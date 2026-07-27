# GLMM + Independent t-test Analysis

This script analyzes your survey data with:

1. GLMM (binomial logistic mixed model)
- Number of learned languages -> accuracy for single vs cluster sounds
- Length of residence in Japan -> accuracy for single vs cluster sounds
- Length of Japanese study -> accuracy for single vs cluster sounds

2. Independent t-tests
- Pronunciation learning experience -> participant accuracy (single vs cluster)
- Phonetics/phonology theory experience -> participant accuracy (single vs cluster)

All significance checks use alpha = 0.05.

## Files to add to your GitHub repo

- `analysis/run_glmm_ttest.R`
- `analysis/check_data_quality.R`
- `analysis/install_from_lock.R`
- `analysis/README.md`
- `analysis/apps_script_r_ready_tables.gs`
- `analysis/r-packages.lock.csv`
- `analysis/ANALYSIS_GUIDE.md`
- `analysis/templates/R_TrialData_template.csv`
- `analysis/templates/R_ParticipantData_template.csv`

(Optional output folder will be created automatically: `analysis/output`.)

## Spreadsheet-first workflow (recommended)

If you want to keep raw data separate and avoid manual cleaning:

1. Add `analysis/apps_script_r_ready_tables.gs` to your Google Apps Script project.
2. In `doPost(e)`, call `writeRReadyTables_(ss, payload)` after `payload` is parsed and `ss` is opened.
3. The script will auto-create/update two new sheets:
  - `R_TrialData` (trial-level for GLMM)
  - `R_ParticipantData` (participant-level summary)
4. It writes to those new sheets only and does not overwrite your raw `Summary`/`Details` sheets.

Then just export those two new sheets to CSV and run R directly.

## Input data expected

Prepare two CSV files exported from Google Sheets:

- Details CSV (trial-level): should include at least
  - `submission_id`
  - `stimulus`
  - `is_correct`

- Summary CSV (participant-level): should include at least
  - `submission_id`
  - total number of learned languages
  - stay year/month in Japan
  - study year/month for Japanese
  - pronunciation learning experience (Yes/No or 有/無)
  - phonology/phonetics theory experience (Yes/No or 有/無)

The script tries to auto-detect bilingual column names.

When using the Spreadsheet-first workflow above, export these two sheets as CSV:

- `R_TrialData` -> pass as `details.csv`
- `R_ParticipantData` -> pass as `summary.csv`

## Run locally

### 1) Install exact package versions (lock file)

```bash
Rscript analysis/install_from_lock.R analysis/r-packages.lock.csv
```

### 2) Run QC before analysis

```bash
Rscript analysis/check_data_quality.R path/to/R_TrialData.csv path/to/R_ParticipantData.csv analysis/output
```

If QC returns `PASS`, continue.

### 3) Run analysis

```bash
Rscript analysis/run_glmm_ttest.R path/to/R_TrialData.csv path/to/R_ParticipantData.csv analysis/output
```

### 4) Output files

- `analysis/output/glmm_fixed_effects_results.csv`
- `analysis/output/independent_t_test_results.csv`
- `analysis/output/analysis_summary.txt`
- `analysis/output/qc_summary.txt`

## Notes

- GLMM formula used:
  - `is_correct ~ predictor * sound_type + (1 | submission_id) + (1 | stimulus)`
- `sound_type` is computed from stimulus:
  - single: 11 monophthong targets
  - cluster: remaining palatalized cluster targets
- Independent t-tests are Welch t-tests (default in R `t.test`).
- Column templates are provided in `analysis/templates/`.
- Short reporting and interaction interpretation guide is in `analysis/ANALYSIS_GUIDE.md`.
