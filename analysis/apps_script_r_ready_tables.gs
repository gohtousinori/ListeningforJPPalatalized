/**
 * Add this file to your Google Apps Script project.
 *
 * Then call writeRReadyTables_(ss, payload) inside doPost(e)
 * after payload is parsed and ss is opened.
 *
 * Example in doPost(e):
 *   const payload = JSON.parse(e.postData.contents || '{}');
 *   const ss = SpreadsheetApp.openById(payload.sheetId || SHEET_ID);
 *   writeRReadyTables_(ss, payload);
 */

function writeRReadyTables_(ss, payload) {
  var respondent = payload.respondent_data || {};
  var detailed = payload.detailed_results || [];
  var submissionId = String(payload.submission_id || respondent.submission_id || '').trim();
  var submittedAt = String(respondent.submitted_at || payload.submitted_at || new Date().toISOString());

  if (!submissionId || !Array.isArray(detailed) || detailed.length === 0) {
    return;
  }

  var trialSheet = ensureSheet_(ss, 'R_TrialData');
  var participantSheet = ensureSheet_(ss, 'R_ParticipantData');

  var trialHeaders = [
    'submission_id',
    'submitted_at',
    'stimulus_order',
    'stimulus',
    'sound_type',
    'is_correct',
    'is_correct_num',
    'total_languages_learned',
    'stay_total_months',
    'study_total_months',
    'pron_experience_bin',
    'phonology_theory_bin'
  ];

  var participantHeaders = [
    'submission_id',
    'submitted_at',
    'total_languages_learned',
    'stay_total_months',
    'study_total_months',
    'pron_experience_bin',
    'phonology_theory_bin'
  ];

  ensureHeader_(trialSheet, trialHeaders);
  ensureHeader_(participantSheet, participantHeaders);

  // Avoid duplicates if the same submission is re-sent.
  removeRowsBySubmissionId_(trialSheet, 'submission_id', submissionId);
  removeRowsBySubmissionId_(participantSheet, 'submission_id', submissionId);

  var totalLanguagesLearned = parseNumberLoose_(pickValueByRegex_(respondent, [
    /total number of languages learned/i,
    /total_languages_learned/i
  ]));

  var stayYears = parseNumberLoose_(pickValueByRegex_(respondent, [
    /years lived in japan/i,
    /stay_year/i
  ]));
  var stayMonths = parseNumberLoose_(pickValueByRegex_(respondent, [
    /months lived in japan/i,
    /stay_month/i
  ]));

  var studyYears = parseNumberLoose_(pickValueByRegex_(respondent, [
    /jp learning years/i,
    /japanese learning years/i,
    /study_year/i
  ]));
  var studyMonths = parseNumberLoose_(pickValueByRegex_(respondent, [
    /jp learning months/i,
    /japanese learning months/i,
    /study_month/i
  ]));

  var pronExperienceBin = parseYesNoBinary_(pickValueByRegex_(respondent, [
    /pronunciation learning experience/i,
    /pron_experience/i
  ]));

  var phonologyTheoryBin = parseYesNoBinary_(pickValueByRegex_(respondent, [
    /phonology.*phonetics experience/i,
    /phonology_theory_experience/i
  ]));

  var stayTotalMonths = toNumberOrBlank_(stayYears) * 12 + toNumberOrBlank_(stayMonths);
  var studyTotalMonths = toNumberOrBlank_(studyYears) * 12 + toNumberOrBlank_(studyMonths);

  var singleSounds = {
    'し': true, 'ち': true, 'ひ': true, 'に': true, 'ぎ': true,
    'じ': true, 'き': true, 'り': true, 'み': true, 'び': true, 'ぴ': true
  };

  var trialRows = [];
  for (var i = 0; i < detailed.length; i++) {
    var row = detailed[i] || {};
    var stimulus = String(row.stimulus || '');
    var isCorrectRaw = row.is_correct;
    var isCorrectNum = parseTrueFalseBinary_(isCorrectRaw);
    var soundType = singleSounds[stimulus] ? 'single' : 'cluster';

    trialRows.push([
      submissionId,
      submittedAt,
      row.stimulus_order || i + 1,
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
    totalLanguagesLearned,
    stayTotalMonths,
    studyTotalMonths,
    pronExperienceBin,
    phonologyTheoryBin
  ]];

  participantSheet.getRange(participantSheet.getLastRow() + 1, 1, 1, participantHeaders.length).setValues(participantRow);
}

function ensureSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function ensureHeader_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var needsUpdate = false;
  if (existing.length < headers.length) {
    needsUpdate = true;
  } else {
    for (var i = 0; i < headers.length; i++) {
      if (String(existing[i] || '') !== headers[i]) {
        needsUpdate = true;
        break;
      }
    }
  }

  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function removeRowsBySubmissionId_(sheet, submissionHeaderName, submissionId) {
  if (sheet.getLastRow() < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var colIndex = headers.indexOf(submissionHeaderName);
  if (colIndex === -1) return;

  var values = sheet.getRange(2, colIndex + 1, sheet.getLastRow() - 1, 1).getValues();

  // Delete bottom-up so row indexes stay valid.
  for (var r = values.length - 1; r >= 0; r--) {
    if (String(values[r][0] || '') === submissionId) {
      sheet.deleteRow(r + 2);
    }
  }
}

function pickValueByRegex_(obj, regexList) {
  var keys = Object.keys(obj || {});
  for (var i = 0; i < regexList.length; i++) {
    var re = regexList[i];
    for (var k = 0; k < keys.length; k++) {
      if (re.test(keys[k])) {
        return obj[keys[k]];
      }
    }
  }
  return '';
}

function parseNumberLoose_(value) {
  var txt = String(value == null ? '' : value).trim();
  if (!txt) return '';
  txt = txt.replace(/\+/g, '');
  var n = Number(txt);
  return isNaN(n) ? '' : n;
}

function toNumberOrBlank_(value) {
  if (value === '' || value == null) return 0;
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function parseYesNoBinary_(value) {
  var txt = String(value == null ? '' : value).trim().toLowerCase();
  if (txt === '有' || txt === 'yes' || txt === 'y' || txt === '1' || txt === 'true') return 1;
  if (txt === '無' || txt === 'no' || txt === 'n' || txt === '0' || txt === 'false') return 0;
  return '';
}

function parseTrueFalseBinary_(value) {
  var txt = String(value == null ? '' : value).trim().toLowerCase();
  if (txt === 'true' || txt === 't' || txt === '1') return 1;
  if (txt === 'false' || txt === 'f' || txt === '0') return 0;

  var n = Number(txt);
  if (!isNaN(n)) return n > 0 ? 1 : 0;

  return '';
}
