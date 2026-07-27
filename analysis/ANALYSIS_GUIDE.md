# Analysis Guide (Short)

## Objective
Estimate how language learning background relates to Japanese sound identification accuracy, with alpha = 0.05.

## Outcomes
- Trial-level binary accuracy: `is_correct` (0/1)
- Sound class: `sound_type` (`single`, `cluster`)

## GLMM Models
Use binomial mixed-effects logistic regression:

`is_correct ~ predictor * sound_type + (1 | submission_id) + (1 | stimulus)`

Run three models (one predictor at a time):
1. `total_languages_learned`
2. `stay_total_months`
3. `study_total_months`

## Independent t-tests
Participant-level mean accuracy is computed separately for `single` and `cluster`.
Run Welch independent t-tests for each sound type:
1. `pron_experience_bin` (1 vs 0)
2. `phonology_theory_bin` (1 vs 0)

## Interaction Interpretation (`predictor:sound_typecluster`)
- Significant (`p < .05`): predictor effect differs between `single` and `cluster`.
- Not significant: no evidence that predictor slope differs by sound type.

## Reporting Minimum
For GLMM fixed effects:
- coefficient (`estimate`), SE, z, p, 95% CI

For t-tests:
- group means, t, df, p, sample sizes per group

## Practical Note
If interaction is significant, report simple effects by sound type and do not rely only on the main effect of the predictor.
