const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { generateXlsx } = require('./xlsx_builder.js');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'pairs.json');
const RESULTS_DIR = path.join(__dirname, 'results');
const IMAGES_DIR = path.join(__dirname, 'CBDatabase', 'Images');
const MASKS_DIR = path.join(__dirname, 'CBDatabase', 'Masks');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Load pairs data
let allPairs = [];
try {
  if (fs.existsSync(DATA_FILE)) {
    allPairs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`Loaded ${allPairs.length} image pairs from ${DATA_FILE}`);
  } else {
    console.warn(`Warning: ${DATA_FILE} not found. Please run data indexer.`);
  }
} catch (err) {
  console.error('Error loading pairs data:', err);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const isCode = filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css');
    const cacheControl = isCode ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600';

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl
    });
    stream.pipe(res);
  });
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // --- API Routes ---

  // Health check
  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // Dataset info
  if (pathname === '/api/dataset-info') {
    const fillers = allPairs.filter(p => p.category === 'filler');
    const practice = allPairs.filter(p => p.category === 'practice');
    const windows = allPairs.filter(p => p.category === 'window');
    const mirrors = allPairs.filter(p => p.category === 'mirror');
    const lefts = allPairs.filter(p => p.side === 'L');
    const rights = allPairs.filter(p => p.side === 'R');

    sendJson(res, 200, {
      total_pairs: allPairs.length,
      categories: {
        filler: fillers.length,
        practice: practice.length,
        window: windows.length,
        mirror: mirrors.length
      },
      sides: {
        left: lefts.length,
        right: rights.length,
        practice: practice.length
      },
      defaults: {
        n: Math.min(10, allPairs.length),
        max_n: allPairs.length,
        t_interval_ms: 80,
        image_duration_ms: 240,
        tolerance_px: 15,
        mode: 'continuous_flicker',
        timeout_sec: 60
      }
    });
    return;
  }

  // Get trials/pairs for experiment
  if (pathname === '/api/pairs') {
    let n = parseInt(parsedUrl.query.n, 10) || 10;
    const shuffle = parsedUrl.query.shuffle !== 'false';
    const category = parsedUrl.query.category || 'all';
    const side = parsedUrl.query.side || 'all';

    let filtered = [...allPairs];
    if (category !== 'all') {
      filtered = filtered.filter(p => p.category === category);
    } else {
      // Exclude practice pairs from general experimental trials
      filtered = filtered.filter(p => p.category !== 'practice');
    }
    if (side !== 'all') {
      filtered = filtered.filter(p => p.side === side);
    }
    if (parsedUrl.query.hud_safe === 'true') {
      filtered = filtered.filter(p => p.hud_safe === true);
    }

    if (shuffle) {
      filtered = shuffleArray(filtered);
    }

    if (n < 1) n = 1;
    let selected = [];
    if (filtered.length > 0) {
      if (n <= filtered.length) {
        selected = filtered.slice(0, n);
      } else {
        selected = [...filtered];
        while (selected.length < n) {
          const batch = shuffle ? shuffleArray([...filtered]) : [...filtered];
          const needed = n - selected.length;
          selected = selected.concat(batch.slice(0, needed));
        }
      }
    }

    sendJson(res, 200, {
      count: selected.length,
      total_available: filtered.length,
      trials: selected
    });
    return;
  }

  // Save session results
  if (pathname === '/api/save-session' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        req.connection.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sessionId = payload.session_id || `session_${timestamp}`;
        const jsonFilename = `${sessionId}.json`;
        const csvFilename = `${sessionId}.csv`;

        const jsonPath = path.join(RESULTS_DIR, jsonFilename);
        const csvPath = path.join(RESULTS_DIR, csvFilename);

        // Save JSON
        fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf-8');

        // Convert trials to CSV
        const headers = [
          'trial_number',
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
        const trials = payload.trials || [];
        const params = payload.parameters || {};

        trials.forEach((t, idx) => {
          const moduleLabel = t.module_name || (t.module === 'c' ? 'Module C (Heads-Up Display HUD)' : (t.module === 'b' ? 'Module B (Speed & Flicker)' : 'Module A (Flicker)'));
          const speedRaw = t.speed_recall_actual != null ? t.speed_recall_actual : (t.dashboardData?.speed != null ? t.dashboardData.speed : '');
          const speedShown = (speedRaw !== '' && !isNaN(Number(speedRaw))) ? String(Math.round(Number(speedRaw))).padStart(2, '0') : (speedRaw ? String(speedRaw) : '');

          const symbolObj = t.dashboardData?.symbol || t.dashboardData?.symbolName || t.symbol_recall_actual;
          const symbolShown = (typeof symbolObj === 'object' && symbolObj?.name) ? symbolObj.name : (typeof symbolObj === 'string' ? symbolObj : '');

          const rpmRaw = t.rpm_recall_actual != null ? t.rpm_recall_actual : (t.dashboardData?.rpm != null ? t.dashboardData.rpm : '');
          const rpmShown = (rpmRaw !== '' && !isNaN(Number(rpmRaw))) ? Number(rpmRaw).toFixed(1) : (rpmRaw ? String(rpmRaw) : '');

          const probeType = t.probe_type || (t.speed_recall_asked ? 'speed' : (t.symbol_recall_asked ? 'symbol' : (t.rpm_recall_asked ? 'rpm' : '')));
          const speedProbed = t.speed_recall_asked ? 1 : 0;
          let speedRecalled = '';
          if (t.speed_recall_asked && t.speed_recall_response != null) {
            speedRecalled = !isNaN(Number(t.speed_recall_response)) 
              ? String(Math.round(Number(t.speed_recall_response))).padStart(2, '0') 
              : String(t.speed_recall_response);
          }
          const speedAccurate = t.speed_recall_asked ? (t.speed_recall_accurate ? 1 : 0) : '';
          let speedError = '';
          if (t.speed_recall_asked && t.speed_recall_response != null && !isNaN(Number(t.speed_recall_response)) && speedShown !== '' && !isNaN(Number(speedShown))) {
            speedError = Math.abs(Number(t.speed_recall_response) - Number(speedShown));
          }

          const symbolProbed = t.symbol_recall_asked ? 1 : 0;
          const symbolRecalled = (t.symbol_recall_asked && t.symbol_recall_response != null) ? String(t.symbol_recall_response) : '';
          const symbolAccurate = t.symbol_recall_asked ? (t.symbol_recall_accurate ? 1 : 0) : '';

          const rpmProbed = t.rpm_recall_asked ? 1 : 0;
          let rpmRecalled = '';
          if (t.rpm_recall_asked && t.rpm_recall_response != null) {
            rpmRecalled = !isNaN(Number(t.rpm_recall_response)) ? Number(t.rpm_recall_response).toFixed(1) : String(t.rpm_recall_response);
          }
          const rpmAccurate = t.rpm_recall_asked ? (t.rpm_recall_accurate ? 1 : 0) : '';
          let rpmError = '';
          if (t.rpm_recall_asked && t.rpm_recall_response != null && !isNaN(Number(t.rpm_recall_response)) && rpmShown !== '' && !isNaN(Number(rpmShown))) {
            rpmError = Number(Math.abs(Number(t.rpm_recall_response) - Number(rpmShown)).toFixed(1));
          }

          const recallAccurate = (t.speed_recall_asked || t.symbol_recall_asked || t.rpm_recall_asked) ? (t.recall_accurate ? 1 : 0) : '';

          const row = [
            t.trial_index || (idx + 1),
            `"${moduleLabel}"`,
            `"${t.id || ''}"`,
            `"${t.trial_str || ''}"`,
            `"${t.category || ''}"`,
            `"${t.side || ''}"`,
            `"${t.object_name || ''}"`,
            t.accurate ? 1 : 0,
            t.response_time_ms != null ? Number(t.response_time_ms).toFixed(1) : '',
            t.response_time_ms != null ? (Number(t.response_time_ms) / 1000).toFixed(3) : '',
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
            t.click_x != null ? t.click_x : '',
            t.click_y != null ? t.click_y : '',
            t.target_x != null ? t.target_x : '',
            t.target_y != null ? t.target_y : '',
            t.distance_px != null ? Number(t.distance_px).toFixed(1) : '',
            t.skipped ? 1 : 0,
            `"${t.present_image || ''}"`,
            `"${t.absent_image || ''}"`,
            `"${t.mask_image || ''}"`,
            params.t_interval_ms || '',
            params.image_duration_ms || '',
            `"${params.mode || ''}"`,
            `"${payload.timestamp || new Date().toISOString()}"`
          ];
          csvRows.push(row.join(','));
        });

        fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');

        // Generate genuine multi-sheet Excel (.xlsx) file synchronously
        const xlsxFilename = `${sessionId}.xlsx`;
        const xlsxPath = path.join(RESULTS_DIR, xlsxFilename);
        try {
          const summary = payload.summary || {};

          // --- Sheet 1: Executive Summary & Module Performance ---
          const summaryHeaders = ['Metric', 'Value', 'Details'];
          const summaryRows = [
            ['Session ID', sessionId, 'Unique session identifier'],
            ['Session Timestamp', payload.timestamp || new Date().toISOString(), 'Recorded test timestamp'],
            ['Trials per Module (n)', params.n || '', 'Configured samples per module'],
            ['Total Trials (3n)', summary.total_trials || trials.length, 'Disjoint image pairs across 3 modules'],
            ['Flicker Interval (t)', `${params.t_interval_ms || 250} ms`, 'Blank screen duration'],
            ['Image Duration', `${params.image_duration_ms || 1000} ms`, 'Scene presentation duration'],
            ['Hit Tolerance', `${params.tolerance_px || 15} px`, 'Target click radius'],
            ['Total Session Duration', `${summary.total_duration_sec || 0}s`, 'Elapsed session time'],
            ['Overall Detection Accuracy', `${summary.accuracy_percent || 0}%`, `${summary.correct_count || 0} / ${summary.total_trials || trials.length} correct hits`],
            ['Mean Response Time', `${summary.mean_rt_ms || 0} ms`, 'Average detection response time'],
            ['', '', ''],
            ['--- MODULE PERFORMANCE COMPARISON ---', '', ''],
            ['Module 1: Flicker Only Accuracy', `${summary.module_a_accuracy || 0}%`, `${summary.module_a_correct || 0} / ${summary.module_a_trials || 0} correct hits`],
            ['Module 2: Speed & Cluster Accuracy', `${summary.module_b_accuracy || 0}%`, `${summary.module_b_correct || 0} / ${summary.module_b_trials || 0} correct hits`],
            ['Module 3: Heads-Up Display HUD Accuracy', `${summary.module_c_accuracy || 0}%`, `${summary.module_c_correct || 0} / ${summary.module_c_trials || 0} correct hits`],
            ['', '', ''],
            ['--- MCQ RECALL METRICS ---', '', ''],
            ['Speed Recall Accuracy', `${summary.speed_recall_accuracy_percent || 0}%`, `${summary.speed_recall_correct_count || 0} / ${summary.speed_recall_probed_count || 0} probed correct${summary.speed_recall_mean_error_kmh != null ? ` (avg error ±${summary.speed_recall_mean_error_kmh} km/h)` : ''}`],
            ['Warning Symbol Recall Accuracy', `${summary.symbol_recall_accuracy_percent || 0}%`, `${summary.symbol_recall_correct_count || 0} / ${summary.symbol_recall_probed_count || 0} probed correct`],
            ['Engine RPM Recall Accuracy', `${summary.rpm_recall_accuracy_percent || 0}%`, `${summary.rpm_recall_correct_count || 0} / ${summary.rpm_recall_probed_count || 0} probed correct${summary.rpm_recall_mean_error != null ? ` (avg error ±${summary.rpm_recall_mean_error}k RPM)` : ''}`],
            ['', '', ''],
            ['--- VISUAL FIELD BREAKDOWN ---', '', ''],
            ['Left Visual Field (L) Accuracy', summary.left_accuracy || '--', `${summary.left_correct || 0} / ${summary.left_trials || 0} correct`],
            ['Left Visual Field (L) Mean RT', `${summary.left_mean_rt || '--'}`, ''],
            ['Right Visual Field (R) Accuracy', summary.right_accuracy || '--', `${summary.right_correct || 0} / ${summary.right_trials || 0} correct`],
            ['Right Visual Field (R) Mean RT', `${summary.right_mean_rt || '--'}`, '']
          ];

          function formatTrialRow(t, idx) {
            const moduleLabel = t.module_name || (t.module === 'c' ? 'Module C (Heads-Up Display HUD)' : (t.module === 'b' ? 'Module B (Speed & Flicker)' : 'Module A (Flicker)'));
            const speedRaw = t.speed_recall_actual != null ? t.speed_recall_actual : (t.dashboardData?.speed != null ? t.dashboardData.speed : '');
            const speedShown = (speedRaw !== '' && !isNaN(Number(speedRaw))) ? String(Math.round(Number(speedRaw))).padStart(2, '0') : (speedRaw ? String(speedRaw) : '');

            const symbolObj = t.dashboardData?.symbol || t.dashboardData?.symbolName || t.symbol_recall_actual;
            const symbolShown = (typeof symbolObj === 'object' && symbolObj?.name) ? symbolObj.name : (typeof symbolObj === 'string' ? symbolObj : '');

            const rpmRaw = t.rpm_recall_actual != null ? t.rpm_recall_actual : (t.dashboardData?.rpm != null ? t.dashboardData.rpm : '');
            const rpmShown = (rpmRaw !== '' && !isNaN(Number(rpmRaw))) ? Number(rpmRaw).toFixed(1) : (rpmRaw ? String(rpmRaw) : '');

            const probeType = t.probe_type || (t.speed_recall_asked ? 'speed' : (t.symbol_recall_asked ? 'symbol' : (t.rpm_recall_asked ? 'rpm' : '')));
            const speedProbed = t.speed_recall_asked ? 1 : 0;
            let speedRecalled = '';
            if (t.speed_recall_asked && t.speed_recall_response != null) {
              speedRecalled = !isNaN(Number(t.speed_recall_response)) 
                ? String(Math.round(Number(t.speed_recall_response))).padStart(2, '0') 
                : String(t.speed_recall_response);
            }
            const speedAccurate = t.speed_recall_asked ? (t.speed_recall_accurate ? 1 : 0) : '';
            let speedError = '';
            if (t.speed_recall_asked && t.speed_recall_response != null && !isNaN(Number(t.speed_recall_response)) && speedShown !== '' && !isNaN(Number(speedShown))) {
              speedError = Math.abs(Number(t.speed_recall_response) - Number(speedShown));
            }

            const symbolProbed = t.symbol_recall_asked ? 1 : 0;
            const symbolRecalled = (t.symbol_recall_asked && t.symbol_recall_response != null) ? String(t.symbol_recall_response) : '';
            const symbolAccurate = t.symbol_recall_asked ? (t.symbol_recall_accurate ? 1 : 0) : '';

            const rpmProbed = t.rpm_recall_asked ? 1 : 0;
            let rpmRecalled = '';
            if (t.rpm_recall_asked && t.rpm_recall_response != null) {
              rpmRecalled = !isNaN(Number(t.rpm_recall_response)) ? Number(t.rpm_recall_response).toFixed(1) : String(t.rpm_recall_response);
            }
            const rpmAccurate = t.rpm_recall_asked ? (t.rpm_recall_accurate ? 1 : 0) : '';
            let rpmError = '';
            if (t.rpm_recall_asked && t.rpm_recall_response != null && !isNaN(Number(t.rpm_recall_response)) && rpmShown !== '' && !isNaN(Number(rpmShown))) {
              rpmError = Number(Math.abs(Number(t.rpm_recall_response) - Number(rpmShown)).toFixed(1));
            }

            const recallAccurate = (t.speed_recall_asked || t.symbol_recall_asked || t.rpm_recall_asked) ? (t.recall_accurate ? 1 : 0) : '';

            return {
              trialIndex: t.trial_index || (idx + 1),
              moduleLabel,
              id: t.id || '',
              trialStr: t.trial_str || '',
              category: t.category || '',
              side: t.side || '',
              objectName: t.object_name || '',
              accurate: t.accurate ? 1 : 0,
              rtMs: t.response_time_ms != null ? Number(Number(t.response_time_ms).toFixed(1)) : '',
              rtSec: t.response_time_ms != null ? Number((Number(t.response_time_ms) / 1000).toFixed(3)) : '',
              speedShown: speedShown || '',
              symbolShown: symbolShown || '',
              rpmShown: rpmShown || '',
              probeType: probeType || '',
              speedProbed,
              speedRecalled: speedRecalled || '',
              speedAccurate: speedAccurate !== '' ? Number(speedAccurate) : '',
              speedError: speedError !== '' ? Number(speedError) : '',
              symbolProbed,
              symbolRecalled: symbolRecalled || '',
              symbolAccurate: symbolAccurate !== '' ? Number(symbolAccurate) : '',
              rpmProbed,
              rpmRecalled: rpmRecalled || '',
              rpmAccurate: rpmAccurate !== '' ? Number(rpmAccurate) : '',
              rpmError: rpmError !== '' ? Number(rpmError) : '',
              recallAccurate: recallAccurate !== '' ? Number(recallAccurate) : '',
              clickX: t.click_x != null ? t.click_x : '',
              clickY: t.click_y != null ? t.click_y : '',
              targetX: t.target_x != null ? t.target_x : '',
              targetY: t.target_y != null ? t.target_y : '',
              distancePx: t.distance_px != null ? Number(Number(t.distance_px).toFixed(1)) : '',
              skipped: t.skipped ? 1 : 0,
              presentImg: t.present_image || '',
              absentImg: t.absent_image || '',
              maskImg: t.mask_image || '',
              tInterval: params.t_interval_ms || '',
              imgDur: params.image_duration_ms || '',
              mode: params.mode || '',
              timestamp: payload.timestamp || new Date().toISOString()
            };
          }

          const parsedTrials = trials.map(formatTrialRow);

          // --- Sheet 2: Module 1 (Flicker Only) ---
          const mod1Headers = [
            'Trial #', 'Module', 'Pair ID', 'Trial Code', 'Category', 'Visual Field', 'Target Object',
            'Detection Hit (1/0)', 'RT (ms)', 'RT (sec)', 'Click X', 'Click Y', 'Target X', 'Target Y',
            'Distance Error (px)', 'Skipped', 'Present Image', 'Absent Image', 'Mask Image'
          ];
          const mod1Rows = parsedTrials
            .filter(t => t.moduleLabel.includes('Module A') || t.moduleLabel.includes('Module 1'))
            .map(t => [
              t.trialIndex, t.moduleLabel, t.id, t.trialStr, t.category, t.side, t.objectName,
              t.accurate, t.rtMs, t.rtSec, t.clickX, t.clickY, t.targetX, t.targetY,
              t.distancePx, t.skipped, t.presentImg, t.absentImg, t.maskImg
            ]);

          // --- Sheet 3: Module 2 (Speed & Cluster Strip) ---
          const mod2Headers = [
            'Trial #', 'Module', 'Pair ID', 'Visual Field', 'Target Object',
            'Detection Hit (1/0)', 'RT (ms)', 'Speed Shown (km/h)', 'Symbol Shown', 'RPM Shown',
            'Recall Probe Type', 'Speed Recalled', 'Speed Accurate', 'Speed Error (km/h)',
            'Symbol Recalled', 'Symbol Accurate', 'RPM Recalled', 'RPM Accurate', 'RPM Error',
            'Overall Recall Hit', 'Click X', 'Click Y', 'Target X', 'Target Y', 'Distance Error (px)', 'Skipped'
          ];
          const mod2Rows = parsedTrials
            .filter(t => t.moduleLabel.includes('Module B') || t.moduleLabel.includes('Module 2'))
            .map(t => [
              t.trialIndex, t.moduleLabel, t.id, t.side, t.objectName,
              t.accurate, t.rtMs, t.speedShown, t.symbolShown, t.rpmShown,
              t.probeType, t.speedRecalled, t.speedAccurate, t.speedError,
              t.symbolRecalled, t.symbolAccurate, t.rpmRecalled, t.rpmAccurate, t.rpmError,
              t.recallAccurate, t.clickX, t.clickY, t.targetX, t.targetY, t.distancePx, t.skipped
            ]);

          // --- Sheet 4: Module 3 (Heads-Up Display HUD) ---
          const mod3Headers = [
            'Trial #', 'Module', 'Pair ID', 'Visual Field', 'Target Object',
            'Detection Hit (1/0)', 'RT (ms)', 'HUD Speed (km/h)', 'HUD Symbol Shown', 'HUD RPM Shown',
            'Recall Probe Type', 'Speed Recalled', 'Speed Accurate', 'Speed Error (km/h)',
            'Symbol Recalled', 'Symbol Accurate', 'RPM Recalled', 'RPM Accurate', 'RPM Error',
            'Overall Recall Hit', 'Click X', 'Click Y', 'Target X', 'Target Y', 'Distance Error (px)', 'Skipped'
          ];
          const mod3Rows = parsedTrials
            .filter(t => t.moduleLabel.includes('Module C') || t.moduleLabel.includes('Module 3'))
            .map(t => [
              t.trialIndex, t.moduleLabel, t.id, t.side, t.objectName,
              t.accurate, t.rtMs, t.speedShown, t.symbolShown, t.rpmShown,
              t.probeType, t.speedRecalled, t.speedAccurate, t.speedError,
              t.symbolRecalled, t.symbolAccurate, t.rpmRecalled, t.rpmAccurate, t.rpmError,
              t.recallAccurate, t.clickX, t.clickY, t.targetX, t.targetY, t.distancePx, t.skipped
            ]);

          // --- Sheet 5: All Trials (Master Unified Data) ---
          const allHeaders = headers;
          const allRows = parsedTrials.map(t => [
            t.trialIndex, t.moduleLabel, t.id, t.trialStr, t.category, t.side, t.objectName,
            t.accurate, t.rtMs, t.rtSec, t.speedShown, t.symbolShown, t.rpmShown,
            t.probeType, t.speedProbed, t.speedRecalled, t.speedAccurate, t.speedError,
            t.symbolProbed, t.symbolRecalled, t.symbolAccurate,
            t.rpmProbed, t.rpmRecalled, t.rpmAccurate, t.rpmError,
            t.recallAccurate, t.clickX, t.clickY, t.targetX, t.targetY,
            t.distancePx, t.skipped, t.presentImg, t.absentImg, t.maskImg,
            t.tInterval, t.imgDur, t.mode, t.timestamp
          ]);

          const multiSheets = [
            { name: 'Summary', headers: summaryHeaders, rows: summaryRows },
            { name: 'Module 1 - Flicker', headers: mod1Headers, rows: mod1Rows },
            { name: 'Module 2 - Cluster', headers: mod2Headers, rows: mod2Rows },
            { name: 'Module 3 - HUD', headers: mod3Headers, rows: mod3Rows },
            { name: 'All Trials', headers: allHeaders, rows: allRows }
          ];

          const xlsxBuf = generateXlsx(multiSheets);
          fs.writeFileSync(xlsxPath, xlsxBuf);
        } catch (xlsxErr) {
          console.warn('XLSX generation warning:', xlsxErr.message);
        }

        sendJson(res, 200, {
          success: true,
          session_id: sessionId,
          json_file: jsonFilename,
          csv_file: csvFilename,
          xlsx_file: xlsxFilename
        });
      } catch (e) {
        console.error('Error saving session:', e);
        sendJson(res, 500, { success: false, error: e.message });
      }
    });
    return;
  }

  // List saved sessions
  if (pathname === '/api/sessions') {
    fs.readdir(RESULTS_DIR, (err, files) => {
      if (err) {
        sendJson(res, 500, { error: err.message });
        return;
      }
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse();
      const list = jsonFiles.map(f => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf-8'));
          return {
            filename: f,
            session_id: content.session_id,
            timestamp: content.timestamp,
            n: content.parameters?.n,
            accuracy: content.summary?.accuracy_percent,
            mean_rt: content.summary?.mean_rt_ms
          };
        } catch (e) {
          return { filename: f, error: true };
        }
      });
      sendJson(res, 200, { sessions: list });
    });
    return;
  }

  // Direct download endpoint: /api/download/:sessionId/:format
  if (pathname.startsWith('/api/download/')) {
    const parts = pathname.replace('/api/download/', '').split('/');
    const reqSessionId = parts[0];
    const format = (parts[1] || 'xlsx').toLowerCase();
    const filename = `${reqSessionId}.${format}`;
    const filePath = path.join(RESULTS_DIR, filename);

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const mime = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8';

      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="change_blindness_${filename}"`,
        'Cache-Control': 'no-cache, no-store'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File ${filename} not found`);
      return;
    }
  }

  // --- Static File Serving ---

  // Images route: /images/<filename>
  if (pathname.startsWith('/images/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(IMAGES_DIR, filename);
    const ext = path.extname(filePath).toLowerCase();
    sendFile(res, filePath, MIME_TYPES[ext] || 'image/jpeg');
    return;
  }

  // Masks route: /masks/<filename>
  if (pathname.startsWith('/masks/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(MASKS_DIR, filename);
    const ext = path.extname(filePath).toLowerCase();
    sendFile(res, filePath, MIME_TYPES[ext] || 'image/png');
    return;
  }

  // Results route: /results/<filename>
  if (pathname.startsWith('/results/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(RESULTS_DIR, filename);
    const ext = path.extname(filePath).toLowerCase();
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store'
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
    return;
  }

  // Public files route
  let relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/public\//, '');
  if (relPath.startsWith('/')) relPath = relPath.slice(1);
  const publicFilePath = path.join(PUBLIC_DIR, relPath);

  // Check if inside PUBLIC_DIR
  if (!publicFilePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(publicFilePath).toLowerCase();
  sendFile(res, publicFilePath, MIME_TYPES[ext] || 'text/plain');
});

const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(` Change Blindness Experiment System is running!`);
  console.log(` Web URL: http://${HOST}:${PORT}`);
  console.log(` Total stimuli pairs ready: ${allPairs.length}`);
  console.log(`=======================================================`);
});
