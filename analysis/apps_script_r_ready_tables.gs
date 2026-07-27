/**
 * Full Google Apps Script for survey ingestion + analysis-ready sheets.
 * - Receives POST JSON payload from index.html
 * - Writes raw data to Summary / Details
 * - Deduplicates by submission_id
 * - Creates and writes R-ready sheets:
 *   - R_TrialData
 *   - R_ParticipantData
 *
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

const TARGET_SPREADSHEET_ID = "1QNbIit_mmA-hdWUTdMOK7j_7JMsjWXnWGNrH9amUNF8";
const SUMMARY_SHEET = "Summary";
const DETAILS_SHEET = "Details";
const R_TRIAL_SHEET = "R_TrialData";
const R_PARTICIPANT_SHEET = "R_ParticipantData";

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: "Web App is running" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = parsePayload_(e);
    const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);

    const submissionId = String(
      payload.submission_id ||
      ((payload.respondent_data || {}).submission_id || "")
    ).trim();

    if (!submissionId) {
      return jsonResponse_({ success: false, error: "Missing submission_id" });
    }

    const respondent = payload.respondent_data || {};
    respondent.submission_id = submissionId;
    respondent.submitted_at = respondent.submitted_at || new Date().toISOString();

    const detailed = Array.isArray(payload.detailed_results) ? payload.detailed_results : [];

    // 1) Raw sheets
    upsertSummaryRow_(ss, respondent, submissionId);
    upsertDetailsRows_(ss, detailed, respondent, submissionId);

    // 2) R-ready sheets
    writeRReadyTables_(ss, payload);

    return jsonResponse_({
      success: true,
      submission_id: submissionId,
      summary_rows_written: 1,
      details_rows_written: detailed.length
    });
  } catch (err) {
    return jsonResponse_({
      success: false,
      error: err && err.message ? err.message : String(err)
    });
  } finally {
    lock.releaseLock();
  }
}

/* -------------------- Core write logic: Raw sheets -------------------- */

function upsertSummaryRow_(ss, respondentObj, submissionId) {
  const sheet = ensureSheet_(ss, SUMMARY_SHEET);

  removeRowsBySubmissionId_(sheet, "submission_id", submissionId);

  const rowObj = cloneObject_(respondentObj);
  rowObj.submission_id = submissionId;
  rowObj.submitted_at = rowObj.submitted_at || new Date().toISOString();

  appendObjectsWithDynamicHeaders_(sheet, [rowObj]);
}

function upsertDetailsRows_(ss, detailArray, respondentObj, submissionId) {
  const sheet = ensureSheet_(ss, DETAILS_SHEET);

  removeRowsBySubmissionId_(sheet, "submission_id", submissionId);

  if (!Array.isArray(detailArray) || detailArray.length === 0) return;

  const detailRows = [];
  for (var i = 0; i < detailArray.length; i++) {
    const d = detailArray[i] || {};
    const row = cloneObject_(d);

    // Ensure core identifiers
    row.submission_id = submissionId;
    row.submitted_at = respondentObj.submitted_at || new Date().toISOString();

    // Optional respondent-level fields copied into each detail row
    row.native_language = coalesceByRegex_(respondentObj, [/native language/i, /^native_language$/i], row.native_language);
    row.total_languages_learned = coalesceByRegex_(respondentObj, [/total number of languages learned/i, /^total_languages_learned$/i], row.total_languages_learned);
    row.stay_year = coalesceByRegex_(respondentObj, [/years lived in japan/i, /^stay_year$/i], row.stay_year);
    row.stay_month = coalesceByRegex_(respondentObj, [/months lived in japan/i, /^stay_month$/i], row.stay_month);
    row.study_year = coalesceByRegex_(respondentObj, [/jp learning years/i, /^study_year$/i], row.study_year);
    row.study_month = coalesceByRegex_(respondentObj, [/jp learning months/i, /^study_month$/i], row.study_month);
    row.pron_experience = coalesceByRegex_(respondentObj, [/pronunciation learning experience/i, /^pron_experience$/i], row.pron_experience);
    row.phonology_theory_experience = coalesceByRegex_(respondentObj, [/phonology.*phonetics.*experience/i, /^phonology_theory_experience$/i], row.phonology_theory_experience);

    detailRows.push(row);
  }

  appendObjectsWithDynamicHeaders_(sheet, detailRows);
}

/* -------------------- Core write logic: R-ready sheets -------------------- */

function writeRReadyTables_(ss, payload) {
  var respondent = payload.respondent_data || {};
  var detailed = payload.detailed_results || [];
  var submissionId = String(payload.submission_id || respondent.submission_id || "").trim();
  var submittedAt = String(respondent.submitted_at || payload.submitted_at || new Date().toISOString());

  var stimulusOrder = [
    'し','ち','ひ','に','ぎ','じ','き','り','み','び','ぴ',
    'きゃ','きゅ','きょ','ぎゃ','ぎゅ','ぎょ',
    'しゃ','しゅ','しょ','じゃ','じゅ','じょ',
    'ちゃ','ちゅ','ちょ','にゃ','にゅ','にょ',
    'ひゃ','ひゅ','ひょ','ぴゃ','ぴゅ','ぴょ',
    'びゃ','びゅ','びょ','みゃ','みゅ','みょ',
    'りゃ','りゅ','りょ'
  ];

  if (!submissionId || !Array.isArray(detailed) || detailed.length === 0) {
    return;
  }

  var trialSheet = ensureSheet_(ss, R_TRIAL_SHEET);
  var participantSheet = ensureSheet_(ss, R_PARTICIPANT_SHEET);

  var trialHeaders = [
    "submission_id",
    "submitted_at",
    "stimulus_order",
    "stimulus",
    "sound_type",
    "is_correct",
    "is_correct_num",
    "total_languages_learned",
    "stay_total_months",
    "study_total_months",
    "pron_experience_bin",
    "phonology_theory_bin"
  ];

  var participantHeaders = [
    "submission_id",
    "submitted_at",
    "email",
    "study_year",
    "study_month",
    "stay_year",
    "stay_month",
    "pron_experience",
    "institution",
    "total_languages_learned",
    "learned_languages_list",
    "stay_total_months",
    "study_total_months",
    "pron_experience_bin",
    "phonology_theory_bin",
    "phonology_theory_experience"
  ];

  for (var s = 0; s < stimulusOrder.length; s++) {
    var itemNo = String(s + 1).padStart(2, '0');
    participantHeaders.push('stimulus_' + itemNo);
    participantHeaders.push('correct_response_' + itemNo);
    participantHeaders.push('response_' + itemNo);
    participantHeaders.push('result_' + itemNo);
    participantHeaders.push('rt_ms_' + itemNo);
  }

  ensureHeaderExact_(trialSheet, trialHeaders);
  ensureHeaderExact_(participantSheet, participantHeaders);

  // Deduplicate by submission_id for re-sent payloads
  removeRowsBySubmissionId_(trialSheet, "submission_id", submissionId);
  removeRowsBySubmissionId_(participantSheet, "submission_id", submissionId);

  var totalLanguagesLearned = parseNumberLoose_(pickValueByRegex_(respondent, [
    /total number of languages learned/i,
    /^total_languages_learned$/i
  ]));

  var email = String(pickValueByRegex_(respondent, [
    /^email$/i,
    /email/i
  ]) || '');

  var learnedLanguagesList = String(pickValueByRegex_(respondent, [
    /^learned_languages_list$/i,
    /learned languages list/i
  ]) || '');

  var stayYears = parseNumberLoose_(pickValueByRegex_(respondent, [
    /years lived in japan/i,
    /^stay_year$/i
  ]));
  var stayMonths = parseNumberLoose_(pickValueByRegex_(respondent, [
    /months lived in japan/i,
    /^stay_month$/i
  ]));

  var studyYears = parseNumberLoose_(pickValueByRegex_(respondent, [
    /jp learning years/i,
    /japanese learning years/i,
    /^study_year$/i
  ]));
  var studyMonths = parseNumberLoose_(pickValueByRegex_(respondent, [
    /jp learning months/i,
    /japanese learning months/i,
    /^study_month$/i
  ]));

  var pronExperienceBin = parseYesNoBinary_(pickValueByRegex_(respondent, [
    /pronunciation learning experience/i,
    /^pron_experience$/i
  ]));

  var phonologyTheoryBin = parseYesNoBinary_(pickValueByRegex_(respondent, [
    /phonology.*phonetics.*experience/i,
    /^phonology_theory_experience$/i
  ]));

  var pronExperienceText = String(pickValueByRegex_(respondent, [
    /^pron_experience$/i,
    /pronunciation learning experience/i
  ]) || '');

  var institution = String(pickValueByRegex_(respondent, [
    /^institution$/i,
    /institution/i
  ]) || '');

  var phonologyTheoryText = String(pickValueByRegex_(respondent, [
    /^phonology_theory_experience$/i,
    /phonology.*phonetics.*experience/i
  ]) || '');

  var stayTotalMonths = toNumberOrZero_(stayYears) * 12 + toNumberOrZero_(stayMonths);
  var studyTotalMonths = toNumberOrZero_(studyYears) * 12 + toNumberOrZero_(studyMonths);

  var singleSounds = {
    "し": true, "ち": true, "ひ": true, "に": true, "ぎ": true,
    "じ": true, "き": true, "り": true, "み": true, "び": true, "ぴ": true
  };

  var trialRows = [];
  var trialMap = {};
  for (var i = 0; i < detailed.length; i++) {
    var row = detailed[i] || {};
    var stimulus = String(row.stimulus || "");
    var isCorrectRaw = row.is_correct;
    var isCorrectNum = parseTrueFalseBinary_(isCorrectRaw);
    var soundType = singleSounds[stimulus] ? "single" : "cluster";

    trialMap[stimulus] = row;

    trialRows.push([
      submissionId,
      submittedAt,
      row.stimulus_order || (i + 1),
      stimulus,
      soundType,
      isCorrectRaw,
      isCorrectNum,
      totalLanguagesLearned,
      stayTotalMonths,
      studyTotalMonths,
      pronExperienceBin,
      phonologyTheoryBin
    ]);
  }

  if (trialRows.length > 0) {
    trialSheet.getRange(trialSheet.getLastRow() + 1, 1, trialRows.length, trialHeaders.length).setValues(trialRows);
  }

  var participantRow = [[
    submissionId,
    submittedAt,
    email,
    studyYears,
    studyMonths,
    stayYears,
    stayMonths,
    pronExperienceText,
    institution,
    totalLanguagesLearned,
    learnedLanguagesList,
    stayTotalMonths,
    studyTotalMonths,
    pronExperienceBin,
    phonologyTheoryBin,
    phonologyTheoryText
  ]];

  for (var t = 0; t < stimulusOrder.length; t++) {
    var stim = stimulusOrder[t];
    var trial = trialMap[stim] || {};
    var chosenChoice = String(trial.response || trial.chosen_choice || trial.selected_choice || '');
    var correctResponse = String(trial.correct_response || '');
    var isCorrectRaw = trial.is_correct !== undefined ? trial.is_correct : trial.correct;
    var isCorrectValue = String(isCorrectRaw === true || isCorrectRaw === 'TRUE' || isCorrectRaw === 'true' ? 'TRUE' : 'FALSE');
    var rtValue = trial.reaction_time_ms !== undefined && trial.reaction_time_ms !== null ? trial.reaction_time_ms : (trial.rt !== undefined ? trial.rt : '');

    participantRow[0].push(stim);
    participantRow[0].push(correctResponse);
    participantRow[0].push(chosenChoice);
    participantRow[0].push(isCorrectValue);
    participantRow[0].push(rtValue);
  }

  participantSheet.getRange(participantSheet.getLastRow() + 1, 1, 1, participantHeaders.length).setValues(participantRow);
}

/* -------------------- Helpers -------------------- */

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Empty request body");
  }

  var raw = e.postData.contents;
  try {
    return JSON.parse(raw);
  } catch (_) {
    // Optional fallback if payload is urlencoded as payload=<json>
    var params = e.parameter || {};
    if (params.payload) {
      return JSON.parse(params.payload);
    }
    throw new Error("Invalid JSON payload");
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function cloneObject_(obj) {
  var out = {};
  var keys = Object.keys(obj || {});
  for (var i = 0; i < keys.length; i++) out[keys[i]] = obj[keys[i]];
  return out;
}

function appendObjectsWithDynamicHeaders_(sheet, objects) {
  if (!objects || objects.length === 0) return;

  var existingHeaders = [];
  if (sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
    existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h || ""); })
      .filter(function(h) { return h !== ""; });
  }

  var incomingHeaderSet = {};
  for (var i = 0; i < objects.length; i++) {
    var keys = Object.keys(objects[i] || {});
    for (var k = 0; k < keys.length; k++) incomingHeaderSet[keys[k]] = true;
  }
  var incomingHeaders = Object.keys(incomingHeaderSet);

  var mergedHeaders = existingHeaders.slice();
  for (var j = 0; j < incomingHeaders.length; j++) {
    if (mergedHeaders.indexOf(incomingHeaders[j]) === -1) mergedHeaders.push(incomingHeaders[j]);
  }

  if (mergedHeaders.length === 0) return;

  // Write/refresh header row
  sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);

  // Build rows
  var rows = [];
  for (var r = 0; r < objects.length; r++) {
    var obj = objects[r] || {};
    var row = [];
    for (var c = 0; c < mergedHeaders.length; c++) {
      var key = mergedHeaders[c];
      var val = obj[key];
      row.push(val === undefined ? "" : val);
    }
    rows.push(row);
  }

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, mergedHeaders.length).setValues(rows);
  }
}

function ensureHeaderExact_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  var changed = false;
  for (var i = 0; i < headers.length; i++) {
    if (String(current[i] || "") !== headers[i]) {
      changed = true;
      break;
    }
  }
  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function removeRowsBySubmissionId_(sheet, submissionHeaderName, submissionId) {
  if (!submissionId) return;
  if (sheet.getLastRow() < 2 || sheet.getLastColumn() < 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(submissionHeaderName);
  if (colIndex === -1) return;

  var values = sheet.getRange(2, colIndex + 1, sheet.getLastRow() - 1, 1).getValues();

  // Delete bottom-up to keep indexes valid
  for (var r = values.length - 1; r >= 0; r--) {
    if (String(values[r][0] || "") === submissionId) {
      sheet.deleteRow(r + 2);
    }
  }
}

function pickValueByRegex_(obj, regexList) {
  var keys = Object.keys(obj || {});
  for (var i = 0; i < regexList.length; i++) {
    var re = regexList[i];
    for (var k = 0; k < keys.length; k++) {
      if (re.test(keys[k])) return obj[keys[k]];
    }
  }
  return "";
}

function coalesceByRegex_(obj, regexList, fallback) {
  var v = pickValueByRegex_(obj, regexList);
  if (v === "" || v === null || v === undefined) return fallback === undefined ? "" : fallback;
  return v;
}

function parseNumberLoose_(value) {
  var txt = String(value == null ? "" : value).trim();
  if (!txt) return "";
  txt = txt.replace(/\+/g, "");
  var n = Number(txt);
  return isNaN(n) ? "" : n;
}

function toNumberOrZero_(value) {
  if (value === "" || value === null || value === undefined) return 0;
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function parseYesNoBinary_(value) {
  var txt = String(value == null ? "" : value).trim().toLowerCase();
  if (txt === "有" || txt === "yes" || txt === "y" || txt === "1" || txt === "true") return 1;
  if (txt === "無" || txt === "no" || txt === "n" || txt === "0" || txt === "false") return 0;
  return "";
}

function parseTrueFalseBinary_(value) {
  var txt = String(value == null ? "" : value).trim().toLowerCase();
  if (txt === "true" || txt === "t" || txt === "1") return 1;
  if (txt === "false" || txt === "f" || txt === "0") return 0;
  var n = Number(txt);
  if (!isNaN(n)) return n > 0 ? 1 : 0;
  return "";
}
