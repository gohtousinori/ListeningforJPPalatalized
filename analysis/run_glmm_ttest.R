#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(dplyr)
  library(readr)
  library(stringr)
  library(tidyr)
  library(purrr)
  library(lme4)
  library(broom.mixed)
})

alpha_level <- 0.05

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript analysis/run_glmm_ttest.R <details_csv> <summary_csv> [output_dir]", call. = FALSE)
}

details_csv <- args[[1]]
summary_csv <- args[[2]]
output_dir <- ifelse(length(args) >= 3, args[[3]], "analysis/output")
dir.create(output_dir, recursive = TRUE, showWarnings = FALSE)

# -------- Helper functions --------
normalize_name <- function(x) {
  x |>
    str_to_lower() |>
    str_replace_all("[^a-z0-9]+", "_") |>
    str_replace_all("_+", "_") |>
    str_replace_all("^_|_$", "")
}

pick_col <- function(df, candidates, regex = NULL, required = TRUE) {
  cols <- names(df)

  for (cand in candidates) {
    if (cand %in% cols) return(cand)
  }

  if (!is.null(regex)) {
    hit <- cols[str_detect(cols, regex)]
    if (length(hit) > 0) return(hit[[1]])
  }

  if (required) {
    stop(
      paste0(
        "Could not find required column. Candidates: ",
        paste(candidates, collapse = ", "),
        ifelse(is.null(regex), "", paste0(" | regex: ", regex))
      ),
      call. = FALSE
    )
  }

  NA_character_
}

as_binary_yes_no <- function(x) {
  y <- str_trim(as.character(x))
  case_when(
    y %in% c("有", "yes", "Yes", "YES", "y", "Y", "1", "true", "TRUE") ~ 1,
    y %in% c("無", "no", "No", "NO", "n", "N", "0", "false", "FALSE") ~ 0,
    TRUE ~ NA_real_
  )
}

parse_number_or_plus <- function(x) {
  y <- str_trim(as.character(x))
  y <- str_replace(y, "\\+", "")
  suppressWarnings(as.numeric(y))
}

# -------- Load data --------
details_raw <- read_csv(details_csv, show_col_types = FALSE)
summary_raw <- read_csv(summary_csv, show_col_types = FALSE)

names(details_raw) <- normalize_name(names(details_raw))
names(summary_raw) <- normalize_name(names(summary_raw))

# -------- Resolve required columns --------
# Details side
submission_details_col <- pick_col(
  details_raw,
  c("submission_id", "submissionid"),
  regex = "submission"
)

stimulus_col <- pick_col(
  details_raw,
  c("stimulus"),
  regex = "stimulus"
)

is_correct_col <- pick_col(
  details_raw,
  c("is_correct", "correct", "iscorrect"),
  regex = "is_correct|correct"
)

# Summary side
submission_summary_col <- pick_col(
  summary_raw,
  c("submission_id", "submissionid"),
  regex = "submission"
)

total_lang_col <- pick_col(
  summary_raw,
  c("total_languages_learned", "xue_xi_jing_yan_noaruyan_yu_shu_he_ji_total_number_of_languages_learned"),
  regex = "total.*language|languages.*learned"
)

stay_year_col <- pick_col(
  summary_raw,
  c("stay_year", "years_lived_in_japan", "years_lived_japan"),
  regex = "stay.*year|years.*japan"
)
stay_month_col <- pick_col(
  summary_raw,
  c("stay_month", "months_lived_in_japan", "months_lived_japan"),
  regex = "stay.*month|months.*japan"
)

study_year_col <- pick_col(
  summary_raw,
  c("study_year", "jp_learning_years", "japanese_learning_years"),
  regex = "study.*year|learning.*year"
)
study_month_col <- pick_col(
  summary_raw,
  c("study_month", "jp_learning_months", "japanese_learning_months"),
  regex = "study.*month|learning.*month"
)

pron_col <- pick_col(
  summary_raw,
  c("pron_experience", "fa_yin_xue_xi_jing_yan_pronunciation_learning_experience"),
  regex = "pron.*experience|pronunciation.*experience"
)

phon_theory_col <- pick_col(
  summary_raw,
  c("phonology_theory_experience", "yin_yun_lun_yin_sheng_xue_li_lun_xue_xi_jing_yan_academic_theoretical_phonology_phonetics_experience"),
  regex = "phonology.*theory|phonetics.*experience"
)

# -------- Prepare merged trial-level dataset --------
trial_df <- details_raw |>
  transmute(
    submission_id = .data[[submission_details_col]],
    stimulus = .data[[stimulus_col]],
    is_correct_raw = .data[[is_correct_col]]
  ) |>
  mutate(
    is_correct = case_when(
      as.character(is_correct_raw) %in% c("TRUE", "True", "true", "1", "T") ~ 1,
      as.character(is_correct_raw) %in% c("FALSE", "False", "false", "0", "F") ~ 0,
      TRUE ~ suppressWarnings(as.numeric(as.character(is_correct_raw)))
    )
  ) |>
  filter(!is.na(submission_id), !is.na(stimulus), !is.na(is_correct))

participant_df <- summary_raw |>
  transmute(
    submission_id = .data[[submission_summary_col]],
    total_languages_learned = parse_number_or_plus(.data[[total_lang_col]]),
    stay_year = suppressWarnings(as.numeric(as.character(.data[[stay_year_col]]))),
    stay_month = suppressWarnings(as.numeric(as.character(.data[[stay_month_col]]))),
    study_year = suppressWarnings(as.numeric(as.character(.data[[study_year_col]]))),
    study_month = suppressWarnings(as.numeric(as.character(.data[[study_month_col]]))),
    pron_experience_bin = as_binary_yes_no(.data[[pron_col]]),
    phonology_theory_bin = as_binary_yes_no(.data[[phon_theory_col]])
  ) |>
  mutate(
    stay_total_months = stay_year * 12 + stay_month,
    study_total_months = study_year * 12 + study_month
  ) |>
  distinct(submission_id, .keep_all = TRUE)

single_sounds <- c("し","ち","ひ","に","ぎ","じ","き","り","み","び","ぴ")

analysis_df <- trial_df |>
  inner_join(participant_df, by = "submission_id") |>
  mutate(
    sound_type = if_else(stimulus %in% single_sounds, "single", "cluster"),
    sound_type = factor(sound_type, levels = c("single", "cluster"))
  )

if (nrow(analysis_df) == 0) {
  stop("Merged analysis dataset is empty. Check submission_id consistency between details and summary files.", call. = FALSE)
}

# -------- GLMM models --------
fit_glmm <- function(df, predictor_col, label) {
  model_df <- df |>
    filter(!is.na(.data[[predictor_col]]))

  model <- glmer(
    as.formula(paste0("is_correct ~ ", predictor_col, " * sound_type + (1 | submission_id) + (1 | stimulus)")),
    data = model_df,
    family = binomial(link = "logit"),
    control = glmerControl(optimizer = "bobyqa")
  )

  tidy(model, effects = "fixed", conf.int = TRUE, conf.method = "Wald") |>
    mutate(
      model_name = label,
      significant_p_lt_0_05 = if_else(p.value < alpha_level, "YES", "NO")
    )
}

glmm_results <- bind_rows(
  fit_glmm(analysis_df, "total_languages_learned", "GLMM_1_total_languages"),
  fit_glmm(analysis_df, "stay_total_months", "GLMM_2_stay_duration"),
  fit_glmm(analysis_df, "study_total_months", "GLMM_3_study_duration")
)

write_csv(glmm_results, file.path(output_dir, "glmm_fixed_effects_results.csv"))

# -------- Build participant-level accuracy for t-tests --------
participant_accuracy <- analysis_df |>
  group_by(submission_id, sound_type) |>
  summarise(
    accuracy = mean(is_correct, na.rm = TRUE),
    pron_experience_bin = first(pron_experience_bin),
    phonology_theory_bin = first(phonology_theory_bin),
    .groups = "drop"
  )

run_independent_t <- function(df, group_col, label) {
  map_dfr(c("single", "cluster"), function(st) {
    d <- df |>
      filter(sound_type == st, !is.na(.data[[group_col]]))

    g0 <- d |> filter(.data[[group_col]] == 0) |> pull(accuracy)
    g1 <- d |> filter(.data[[group_col]] == 1) |> pull(accuracy)

    if (length(g0) < 2 || length(g1) < 2) {
      return(tibble(
        test_name = label,
        sound_type = st,
        n_group0 = length(g0),
        n_group1 = length(g1),
        mean_group0 = ifelse(length(g0) == 0, NA_real_, mean(g0, na.rm = TRUE)),
        mean_group1 = ifelse(length(g1) == 0, NA_real_, mean(g1, na.rm = TRUE)),
        t_statistic = NA_real_,
        df = NA_real_,
        p_value = NA_real_,
        significant_p_lt_0_05 = "INSUFFICIENT_N"
      ))
    }

    tt <- t.test(g1, g0, var.equal = FALSE)

    tibble(
      test_name = label,
      sound_type = st,
      n_group0 = length(g0),
      n_group1 = length(g1),
      mean_group0 = mean(g0, na.rm = TRUE),
      mean_group1 = mean(g1, na.rm = TRUE),
      t_statistic = unname(tt$statistic),
      df = unname(tt$parameter),
      p_value = tt$p.value,
      significant_p_lt_0_05 = if_else(tt$p.value < alpha_level, "YES", "NO")
    )
  })
}

ttest_results <- bind_rows(
  run_independent_t(participant_accuracy, "pron_experience_bin", "TTEST_1_pronunciation_learning_experience"),
  run_independent_t(participant_accuracy, "phonology_theory_bin", "TTEST_2_phonetic_phonology_theory_experience")
)

write_csv(ttest_results, file.path(output_dir, "independent_t_test_results.csv"))

# -------- Human-readable summary --------
summary_lines <- c(
  "Statistical analysis completed.",
  paste0("Alpha level: ", alpha_level),
  "",
  "Generated files:",
  paste0("- ", file.path(output_dir, "glmm_fixed_effects_results.csv")),
  paste0("- ", file.path(output_dir, "independent_t_test_results.csv")),
  ""
)

sig_glmm <- glmm_results |>
  filter(significant_p_lt_0_05 == "YES") |>
  transmute(line = paste0(model_name, " | ", term, " | p=", signif(p.value, 4))) |>
  pull(line)

sig_t <- ttest_results |>
  filter(significant_p_lt_0_05 == "YES") |>
  transmute(line = paste0(test_name, " | ", sound_type, " | p=", signif(p_value, 4))) |>
  pull(line)

summary_lines <- c(summary_lines, "Significant effects (p < .05):")
if (length(sig_glmm) == 0 && length(sig_t) == 0) {
  summary_lines <- c(summary_lines, "- None")
} else {
  summary_lines <- c(summary_lines, paste0("- ", c(sig_glmm, sig_t)))
}

writeLines(summary_lines, con = file.path(output_dir, "analysis_summary.txt"))
message(paste(summary_lines, collapse = "\n"))
