#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(readr)
  library(dplyr)
  library(stringr)
  library(tidyr)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript analysis/check_data_quality.R <trial_csv> <participant_csv> [output_dir]", call. = FALSE)
}

trial_csv <- args[[1]]
participant_csv <- args[[2]]
output_dir <- ifelse(length(args) >= 3, args[[3]], "analysis/output")
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

required_trial_cols <- c(
  "submission_id", "stimulus", "sound_type", "is_correct_num",
  "total_languages_learned", "stay_total_months", "study_total_months",
  "pron_experience_bin", "phonology_theory_bin"
)
required_participant_cols <- c(
  "submission_id", "total_languages_learned", "stay_total_months",
  "study_total_months", "pron_experience_bin", "phonology_theory_bin"
)

trial <- read_csv(trial_csv, show_col_types = FALSE)
participant <- read_csv(participant_csv, show_col_types = FALSE)

missing_trial <- setdiff(required_trial_cols, names(trial))
missing_participant <- setdiff(required_participant_cols, names(participant))

if (length(missing_trial) > 0 || length(missing_participant) > 0) {
  msg <- c(
    "Missing required columns:",
    paste0("- Trial missing: ", paste(missing_trial, collapse = ", ")),
    paste0("- Participant missing: ", paste(missing_participant, collapse = ", "))
  )
  stop(paste(msg, collapse = "\n"), call. = FALSE)
}

# Coerce numeric-like columns safely
num_cols_trial <- c("is_correct_num", "total_languages_learned", "stay_total_months", "study_total_months", "pron_experience_bin", "phonology_theory_bin")
num_cols_participant <- c("total_languages_learned", "stay_total_months", "study_total_months", "pron_experience_bin", "phonology_theory_bin")

trial <- trial |> mutate(across(all_of(num_cols_trial), ~ suppressWarnings(as.numeric(.x))))
participant <- participant |> mutate(across(all_of(num_cols_participant), ~ suppressWarnings(as.numeric(.x))))

# Missingness summary
missing_trial_tbl <- trial |>
  summarise(across(all_of(required_trial_cols), ~ mean(is.na(.x)))) |>
  pivot_longer(everything(), names_to = "column", values_to = "missing_rate") |>
  arrange(desc(missing_rate))

missing_participant_tbl <- participant |>
  summarise(across(all_of(required_participant_cols), ~ mean(is.na(.x)))) |>
  pivot_longer(everything(), names_to = "column", values_to = "missing_rate") |>
  arrange(desc(missing_rate))

# Duplicate checks
dup_participant <- participant |>
  count(submission_id, name = "n") |>
  filter(n > 1)

dup_trial_pairs <- trial |>
  count(submission_id, stimulus, name = "n") |>
  filter(n > 1)

# Join integrity
trial_ids <- unique(trial$submission_id)
participant_ids <- unique(participant$submission_id)

ids_trial_not_in_participant <- setdiff(trial_ids, participant_ids)
ids_participant_not_in_trial <- setdiff(participant_ids, trial_ids)

# Coding checks
invalid_sound_type <- trial |>
  filter(!sound_type %in% c("single", "cluster") | is.na(sound_type))

invalid_is_correct <- trial |>
  filter(!is_correct_num %in% c(0, 1) | is.na(is_correct_num))

invalid_pron_trial <- trial |>
  filter(!pron_experience_bin %in% c(0, 1) | is.na(pron_experience_bin))

invalid_phon_trial <- trial |>
  filter(!phonology_theory_bin %in% c(0, 1) | is.na(phonology_theory_bin))

invalid_pron_participant <- participant |>
  filter(!pron_experience_bin %in% c(0, 1) | is.na(pron_experience_bin))

invalid_phon_participant <- participant |>
  filter(!phonology_theory_bin %in% c(0, 1) | is.na(phonology_theory_bin))

# Export detailed QC artifacts
write_csv(missing_trial_tbl, file.path(output_dir, "qc_missing_trial.csv"))
write_csv(missing_participant_tbl, file.path(output_dir, "qc_missing_participant.csv"))
write_csv(dup_participant, file.path(output_dir, "qc_duplicates_participant.csv"))
write_csv(dup_trial_pairs, file.path(output_dir, "qc_duplicates_trial_submission_stimulus.csv"))
write_csv(tibble(submission_id = ids_trial_not_in_participant), file.path(output_dir, "qc_ids_trial_not_in_participant.csv"))
write_csv(tibble(submission_id = ids_participant_not_in_trial), file.path(output_dir, "qc_ids_participant_not_in_trial.csv"))
write_csv(invalid_sound_type, file.path(output_dir, "qc_invalid_sound_type_rows.csv"))
write_csv(invalid_is_correct, file.path(output_dir, "qc_invalid_is_correct_rows.csv"))
write_csv(invalid_pron_trial, file.path(output_dir, "qc_invalid_pron_trial_rows.csv"))
write_csv(invalid_phon_trial, file.path(output_dir, "qc_invalid_phon_trial_rows.csv"))
write_csv(invalid_pron_participant, file.path(output_dir, "qc_invalid_pron_participant_rows.csv"))
write_csv(invalid_phon_participant, file.path(output_dir, "qc_invalid_phon_participant_rows.csv"))

pass <- TRUE
if (nrow(dup_participant) > 0) pass <- FALSE
if (nrow(dup_trial_pairs) > 0) pass <- FALSE
if (length(ids_trial_not_in_participant) > 0) pass <- FALSE
if (length(ids_participant_not_in_trial) > 0) pass <- FALSE
if (nrow(invalid_sound_type) > 0) pass <- FALSE
if (nrow(invalid_is_correct) > 0) pass <- FALSE
if (nrow(invalid_pron_trial) > 0 || nrow(invalid_phon_trial) > 0) pass <- FALSE
if (nrow(invalid_pron_participant) > 0 || nrow(invalid_phon_participant) > 0) pass <- FALSE

summary_lines <- c(
  "QC summary",
  paste0("- Trial rows: ", nrow(trial)),
  paste0("- Participant rows: ", nrow(participant)),
  paste0("- Participant duplicate submission_id rows: ", nrow(dup_participant)),
  paste0("- Trial duplicate (submission_id, stimulus) rows: ", nrow(dup_trial_pairs)),
  paste0("- IDs in trial not in participant: ", length(ids_trial_not_in_participant)),
  paste0("- IDs in participant not in trial: ", length(ids_participant_not_in_trial)),
  paste0("- Invalid sound_type rows: ", nrow(invalid_sound_type)),
  paste0("- Invalid is_correct_num rows: ", nrow(invalid_is_correct)),
  paste0("- Invalid pron_experience_bin rows (trial/participant): ", nrow(invalid_pron_trial), "/", nrow(invalid_pron_participant)),
  paste0("- Invalid phonology_theory_bin rows (trial/participant): ", nrow(invalid_phon_trial), "/", nrow(invalid_phon_participant)),
  paste0("- QC overall status: ", ifelse(pass, "PASS", "FAIL"))
)

writeLines(summary_lines, con = file.path(output_dir, "qc_summary.txt"))
message(paste(summary_lines, collapse = "\n"))

if (!pass) {
  quit(status = 2)
}
