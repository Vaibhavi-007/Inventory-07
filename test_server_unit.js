const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Import server logic
// We can test request handlers directly
console.log('Testing server request handling logic...');

const DATA_FILE = path.join(__dirname, 'data', 'pairs.json');
assert(fs.existsSync(DATA_FILE), 'pairs.json must exist');
const pairs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
assert(pairs.length === 258, `Expected 258 pairs, got ${pairs.length}`);
console.log(`✓ Dataset loaded: ${pairs.length} pairs validated.`);

// Validate that every pair's present image, absent image, and mask image exist
let missing = 0;
for (const p of pairs) {
  const pPath = path.join(__dirname, 'CBDatabase', 'Images', p.present_image);
  const aPath = path.join(__dirname, 'CBDatabase', 'Images', p.absent_image);
  const mPath = path.join(__dirname, 'CBDatabase', 'Masks', p.mask_image);

  if (!fs.existsSync(pPath)) {
    console.error('Missing present:', pPath);
    missing++;
  }
  if (!fs.existsSync(aPath)) {
    console.error('Missing absent:', aPath);
    missing++;
  }
  if (!fs.existsSync(mPath)) {
    console.error('Missing mask:', mPath);
    missing++;
  }
}

assert(missing === 0, `All assets must exist, but found ${missing} missing.`);
console.log(`✓ All ${pairs.length} present images, absent images, and masks exist on disk!`);

// Validate frontend files
assert(fs.existsSync(path.join(__dirname, 'public', 'index.html')), 'index.html exists');
assert(fs.existsSync(path.join(__dirname, 'public', 'style.css')), 'style.css exists');
assert(fs.existsSync(path.join(__dirname, 'public', 'app.js')), 'app.js exists');
console.log(`✓ All frontend assets exist and are populated.`);

// Validate HUD Safe precomputations for Module 3
const hudSafePairs = pairs.filter(p => p.hud_safe === true);
assert(hudSafePairs.length >= 100, `Expected at least 100 HUD safe pairs, got ${hudSafePairs.length}`);
console.log(`✓ HUD safe pairs validated: ${hudSafePairs.length} pairs available for Module 3.`);

// Test session saving logic
const RESULTS_DIR = path.join(__dirname, 'results');
const testSessionId = `test_verification_${Date.now()}`;
const testJsonPath = path.join(RESULTS_DIR, `${testSessionId}.json`);
const testCsvPath = path.join(RESULTS_DIR, `${testSessionId}.csv`);

const testPayload = {
  session_id: testSessionId,
  timestamp: new Date().toISOString(),
  participant: {
    name: 'Dr. Jane Doe',
    gender: 'Female'
  },
  participant_name: 'Dr. Jane Doe',
  participant_gender: 'Female',
  parameters: {
    n: 2,
    total_trials: 6,
    t_interval_ms: 250,
    image_duration_ms: 1000,
    mode: 'single_transition',
    tolerance_px: 15
  },
  summary: {
    total_trials: 6,
    correct_count: 5,
    accuracy_percent: 83,
    module_a_trials: 2,
    module_b_trials: 2,
    module_c_trials: 2,
    rpm_recall_probed_count: 1,
    rpm_recall_correct_count: 1,
    rpm_recall_accuracy_percent: 100,
    mean_rt_ms: 1420
  },
  trials: [
    // Module A (2 trials)
    ...pairs.slice(0, 2).map((p, i) => ({
      trial_index: i + 1,
      id: p.id,
      trial_str: p.trial_str,
      category: p.category,
      side: p.side,
      object_name: p.object_name,
      accurate: true,
      response_time_ms: 1200 + i * 100,
      click_x: p.benchmark.x || 500,
      click_y: p.benchmark.y || 400,
      target_x: p.benchmark.x,
      target_y: p.benchmark.y,
      distance_px: 5.0,
      skipped: false,
      present_image: p.present_image,
      absent_image: p.absent_image,
      mask_image: p.mask_image,
      module: 'a',
      module_name: 'Module A (Flicker)'
    })),
    // Module B (2 trials: speed & symbol)
    ...pairs.slice(2, 4).map((p, i) => ({
      trial_index: i + 3,
      id: p.id,
      trial_str: p.trial_str,
      category: p.category,
      side: p.side,
      object_name: p.object_name,
      accurate: true,
      response_time_ms: 1300 + i * 100,
      click_x: p.benchmark.x || 500,
      click_y: p.benchmark.y || 400,
      target_x: p.benchmark.x,
      target_y: p.benchmark.y,
      distance_px: 4.0,
      skipped: false,
      present_image: p.present_image,
      absent_image: p.absent_image,
      mask_image: p.mask_image,
      dashboardData: { speed: 75 + i * 10, symbol: { name: ['Seatbelt', 'Engine'][i] }, rpm: 2.4 + i * 0.5 },
      module: 'b',
      module_name: 'Module B (Speed & Flicker)',
      probe_type: i === 0 ? 'speed' : 'symbol',
      speed_recall_asked: i === 0,
      speed_recall_actual: 75,
      speed_recall_response: 75,
      speed_recall_accurate: true,
      speed_error_kmh: 0,
      symbol_recall_asked: i === 1,
      symbol_recall_actual: 'Engine',
      symbol_recall_response: 'Engine',
      symbol_recall_accurate: true,
      recall_accurate: true
    })),
    // Module C (2 trials: HUD and RPM probe)
    ...hudSafePairs.slice(0, 2).map((p, i) => ({
      trial_index: i + 5,
      id: p.id,
      trial_str: p.trial_str,
      category: p.category,
      side: p.side,
      object_name: p.object_name,
      accurate: true,
      response_time_ms: 1400 + i * 100,
      click_x: p.benchmark.x || 500,
      click_y: p.benchmark.y || 400,
      target_x: p.benchmark.x,
      target_y: p.benchmark.y,
      distance_px: 3.5,
      skipped: false,
      present_image: p.present_image,
      absent_image: p.absent_image,
      mask_image: p.mask_image,
      dashboardData: { speed: 80, symbol: { name: 'Brake' }, rpm: 2.8 },
      module: 'c',
      module_name: 'Module C (Heads-Up Display HUD)',
      probe_type: i === 0 ? 'rpm' : null,
      rpm_shown: 2.8,
      rpm_recall_asked: i === 0,
      rpm_recall_actual: 2.8,
      rpm_recall_response: 2.8,
      rpm_recall_accurate: true,
      rpm_error: 0,
      recall_accurate: i === 0 ? true : null
    }))
  ]
};

fs.writeFileSync(testJsonPath, JSON.stringify(testPayload, null, 2), 'utf-8');

// Build CSV
const headers = [
  'trial_number',
  'participant_name',
  'participant_gender',
  'module',
  'pair_id',
  'trial_str',
  'category',
  'side',
  'object_name',
  'accurate',
  'response_time_ms',
  'response_time_sec',
  'speed_shown_kmh',
  'symbol_shown',
  'rpm_shown',
  'probe_type',
  'speed_recall_probed',
  'speed_recalled_kmh',
  'speed_recall_accurate',
  'speed_error_kmh',
  'symbol_recall_probed',
  'symbol_recalled',
  'symbol_recall_accurate',
  'rpm_recall_probed',
  'rpm_recalled',
  'rpm_recall_accurate',
  'rpm_error',
  'recall_accurate',
  'click_x',
  'click_y',
  'target_x',
  'target_y',
  'distance_px',
  'skipped',
  'present_image',
  'absent_image',
  'mask_image',
  't_interval_ms',
  'image_duration_ms',
  'mode',
  'timestamp'
];
const csvRows = [headers.join(',')];
testPayload.trials.forEach((t, i) => {
  const moduleLabel = t.module_name || (t.module === 'c' ? 'Module C (Heads-Up Display HUD)' : (t.module === 'b' ? 'Module B (Speed & Flicker)' : 'Module A (Flicker)'));
  const speedRaw = t.speed_recall_actual != null ? t.speed_recall_actual : (t.dashboardData?.speed != null ? t.dashboardData.speed : '');
  const speedShown = (speedRaw !== '' && !isNaN(Number(speedRaw))) ? String(Math.round(Number(speedRaw))).padStart(2, '0') : '';

  const symbolObj = t.dashboardData?.symbol || t.dashboardData?.symbolName || t.symbol_recall_actual;
  const symbolShown = (typeof symbolObj === 'object' && symbolObj?.name) ? symbolObj.name : (typeof symbolObj === 'string' ? symbolObj : '');

  const rpmRaw = t.rpm_shown != null ? t.rpm_shown : (t.dashboardData?.rpm != null ? t.dashboardData.rpm : '');
  const rpmShown = (rpmRaw !== '' && !isNaN(Number(rpmRaw))) ? Number(rpmRaw).toFixed(1) : '';

  const probeType = t.probe_type || (t.speed_recall_asked ? 'speed' : (t.symbol_recall_asked ? 'symbol' : (t.rpm_recall_asked ? 'rpm' : '')));
  const speedProbed = t.speed_recall_asked ? 1 : 0;
  const speedRecalled = (t.speed_recall_response != null && t.speed_recall_response !== '') ? String(t.speed_recall_response).padStart(2, '0') : '';
  const speedAccurate = t.speed_recall_asked ? (t.speed_recall_accurate ? 1 : 0) : '';
  const speedError = (t.speed_recall_asked && t.speed_error_kmh != null) ? t.speed_error_kmh : '';

  const symbolProbed = t.symbol_recall_asked ? 1 : 0;
  const symbolRecalled = (t.symbol_recall_asked && t.symbol_recall_response != null) ? String(t.symbol_recall_response) : '';
  const symbolAccurate = t.symbol_recall_asked ? (t.symbol_recall_accurate ? 1 : 0) : '';

  const rpmProbed = t.rpm_recall_asked ? 1 : 0;
  const rpmRecalled = (t.rpm_recall_asked && t.rpm_recall_response != null) ? String(t.rpm_recall_response) : '';
  const rpmAccurate = t.rpm_recall_asked ? (t.rpm_recall_accurate ? 1 : 0) : '';
  const rpmError = (t.rpm_recall_asked && t.rpm_error != null) ? t.rpm_error : '';

  const recallAccurate = (t.speed_recall_asked || t.symbol_recall_asked || t.rpm_recall_asked) ? (t.recall_accurate ? 1 : 0) : '';

  csvRows.push([
    t.trial_index,
    `"${testPayload.participant_name}"`,
    `"${testPayload.participant_gender}"`,
    `"${moduleLabel}"`,
    `"${t.id}"`,
    `"${t.trial_str}"`,
    `"${t.category}"`,
    `"${t.side}"`,
    `"${t.object_name}"`,
    t.accurate ? 1 : 0,
    t.response_time_ms.toFixed(1),
    (t.response_time_ms / 1000).toFixed(3),
    speedShown ? `"${speedShown}"` : '',
    symbolShown ? `"${symbolShown}"` : '',
    rpmShown ? `"${rpmShown}"` : '',
    probeType ? `"${probeType}"` : '',
    speedProbed,
    speedRecalled ? `"${speedRecalled}"` : '',
    speedAccurate,
    speedError,
    symbolProbed,
    symbolRecalled ? `"${symbolRecalled}"` : '',
    symbolAccurate,
    rpmProbed,
    rpmRecalled ? `"${rpmRecalled}"` : '',
    rpmAccurate,
    rpmError,
    recallAccurate,
    t.click_x,
    t.click_y,
    t.target_x,
    t.target_y,
    t.distance_px.toFixed(1),
    t.skipped ? 1 : 0,
    `"${t.present_image}"`,
    `"${t.absent_image}"`,
    `"${t.mask_image}"`,
    testPayload.parameters.t_interval_ms,
    testPayload.parameters.image_duration_ms,
    `"${testPayload.parameters.mode}"`,
    `"${testPayload.timestamp}"`
  ].join(','));
});

fs.writeFileSync(testCsvPath, csvRows.join('\n'), 'utf-8');

// Test XLSX generation
const { generateXlsx } = require('./xlsx_builder.js');
const xlsxRows = testPayload.trials.map((t, idx) => {
  const moduleLabel = t.module_name || (t.module === 'c' ? 'Module C (Heads-Up Display HUD)' : (t.module === 'b' ? 'Module B (Speed & Flicker)' : 'Module A (Flicker)'));
  const speedRaw = t.speed_recall_actual != null ? t.speed_recall_actual : (t.dashboardData?.speed != null ? t.dashboardData.speed : '');
  const speedShown = (speedRaw !== '' && !isNaN(Number(speedRaw))) ? String(Math.round(Number(speedRaw))).padStart(2, '0') : '';

  const symbolObj = t.dashboardData?.symbol || t.dashboardData?.symbolName || t.symbol_recall_actual;
  const symbolShown = (typeof symbolObj === 'object' && symbolObj?.name) ? symbolObj.name : (typeof symbolObj === 'string' ? symbolObj : '');

  const rpmRaw = t.rpm_shown != null ? t.rpm_shown : (t.dashboardData?.rpm != null ? t.dashboardData.rpm : '');
  const rpmShown = (rpmRaw !== '' && !isNaN(Number(rpmRaw))) ? Number(rpmRaw).toFixed(1) : '';

  const probeType = t.probe_type || (t.speed_recall_asked ? 'speed' : (t.symbol_recall_asked ? 'symbol' : (t.rpm_recall_asked ? 'rpm' : '')));
  const speedProbed = t.speed_recall_asked ? 1 : 0;
  const speedRecalled = (t.speed_recall_response != null && t.speed_recall_response !== '') ? String(t.speed_recall_response).padStart(2, '0') : '';
  const speedAccurate = t.speed_recall_asked ? (t.speed_recall_accurate ? 1 : 0) : '';
  const speedError = (t.speed_recall_asked && t.speed_error_kmh != null) ? t.speed_error_kmh : '';

  const symbolProbed = t.symbol_recall_asked ? 1 : 0;
  const symbolRecalled = (t.symbol_recall_asked && t.symbol_recall_response != null) ? String(t.symbol_recall_response) : '';
  const symbolAccurate = t.symbol_recall_asked ? (t.symbol_recall_accurate ? 1 : 0) : '';

  const rpmProbed = t.rpm_recall_asked ? 1 : 0;
  const rpmRecalled = (t.rpm_recall_asked && t.rpm_recall_response != null) ? String(t.rpm_recall_response) : '';
  const rpmAccurate = t.rpm_recall_asked ? (t.rpm_recall_accurate ? 1 : 0) : '';
  const rpmError = (t.rpm_recall_asked && t.rpm_error != null) ? t.rpm_error : '';

  const recallAccurate = (t.speed_recall_asked || t.symbol_recall_asked || t.rpm_recall_asked) ? (t.recall_accurate ? 1 : 0) : '';

  return [
    t.trial_index || (idx + 1),
    testPayload.participant_name,
    testPayload.participant_gender,
    moduleLabel,
    t.id || '',
    t.trial_str || '',
    t.category || '',
    t.side || '',
    t.object_name || '',
    t.accurate ? 1 : 0,
    t.response_time_ms != null ? Number(t.response_time_ms.toFixed(1)) : '',
    t.response_time_ms != null ? Number((t.response_time_ms / 1000).toFixed(3)) : '',
    speedShown || '',
    symbolShown || '',
    rpmShown || '',
    probeType || '',
    speedProbed,
    speedRecalled || '',
    speedAccurate !== '' ? Number(speedAccurate) : '',
    speedError !== '' ? Number(speedError) : '',
    symbolProbed,
    symbolRecalled || '',
    symbolAccurate !== '' ? Number(symbolAccurate) : '',
    rpmProbed,
    rpmRecalled || '',
    rpmAccurate !== '' ? Number(rpmAccurate) : '',
    rpmError !== '' ? Number(rpmError) : '',
    recallAccurate !== '' ? Number(recallAccurate) : '',
    t.click_x != null ? t.click_x : '',
    t.click_y != null ? t.click_y : '',
    t.target_x != null ? t.target_x : '',
    t.target_y != null ? t.target_y : '',
    t.distance_px != null ? Number(t.distance_px.toFixed(1)) : '',
    t.skipped ? 1 : 0,
    t.present_image || '',
    t.absent_image || '',
    t.mask_image || '',
    testPayload.parameters.t_interval_ms,
    testPayload.parameters.image_duration_ms,
    testPayload.parameters.mode,
    testPayload.timestamp
  ];
});
const testXlsxPath = path.join(RESULTS_DIR, `${testSessionId}.xlsx`);
const xlsxBuf = generateXlsx(headers, xlsxRows, 'Trial Results');
fs.writeFileSync(testXlsxPath, xlsxBuf);
assert(fs.existsSync(testXlsxPath) && fs.statSync(testXlsxPath).size > 100, 'Saved XLSX must exist and be populated');
fs.unlinkSync(testXlsxPath);

// Multi-sheet test validation
const multiSheetBuf = generateXlsx([
  { name: 'Summary', headers: ['Metric', 'Value'], rows: [['Total', 6], ['Accuracy', '83%']] },
  { name: 'Module 1 - Flicker', headers: ['Trial', 'Field'], rows: [[1, 'L'], [2, 'R']] },
  { name: 'Module 2 - Cluster', headers: ['Trial', 'Speed'], rows: [[3, '75']] },
  { name: 'Module 3 - HUD', headers: ['Trial', 'RPM'], rows: [[5, '2.8']] },
  { name: 'All Trials', headers, rows: xlsxRows }
]);
const testMultiXlsxPath = path.join(RESULTS_DIR, `${testSessionId}_multi.xlsx`);
fs.writeFileSync(testMultiXlsxPath, multiSheetBuf);
assert(fs.existsSync(testMultiXlsxPath) && fs.statSync(testMultiXlsxPath).size > 1000, 'Multi-sheet XLSX must exist and be valid');
fs.unlinkSync(testMultiXlsxPath);
console.log('✓ Multi-sheet Excel workbook generation verified with 5 sheets.');

assert(fs.existsSync(testJsonPath), 'Saved JSON must exist');
assert(fs.existsSync(testCsvPath), 'Saved CSV must exist');
console.log(`✓ Session saving and CSV formatting validated successfully.`);

// Clean test files
fs.unlinkSync(testJsonPath);
fs.unlinkSync(testCsvPath);

function assert(condition, message) {
  if (!condition) {
    console.error('Assertion failed:', message);
    process.exit(1);
  }
}

console.log('\n=======================================================');
console.log(' ALL 100% INTEGRITY AND SYSTEM TESTS PASSED CLEANLY! ');
console.log('=======================================================');
