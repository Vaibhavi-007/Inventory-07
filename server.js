const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

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
  '.csv': 'text/csv; charset=utf-8'
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

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'public, max-age=3600'
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
    const lefts = allPairs.filter(p => p.side === 'L');
    const rights = allPairs.filter(p => p.side === 'R');

    sendJson(res, 200, {
      total_pairs: allPairs.length,
      categories: {
        filler: fillers.length,
        practice: practice.length
      },
      sides: {
        left: lefts.length,
        right: rights.length,
        practice: practice.length
      },
      defaults: {
        n: 10,
        t_interval_ms: 250,
        image_duration_ms: 1000,
        tolerance_px: 15,
        mode: 'single_transition'
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
    }
    if (side !== 'all') {
      filtered = filtered.filter(p => p.side === side);
    }

    if (shuffle) {
      filtered = shuffleArray(filtered);
    }

    if (n < 1) n = 1;
    if (n > filtered.length) n = filtered.length;

    const selected = filtered.slice(0, n);
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
          'pair_id',
          'trial_str',
          'category',
          'side',
          'object_name',
          'accurate',
          'response_time_ms',
          'response_time_sec',
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
          const row = [
            t.trial_index || (idx + 1),
            `"${t.id || ''}"`,
            `"${t.trial_str || ''}"`,
            `"${t.category || ''}"`,
            `"${t.side || ''}"`,
            `"${t.object_name || ''}"`,
            t.accurate ? 1 : 0,
            t.response_time_ms != null ? t.response_time_ms.toFixed(1) : '',
            t.response_time_ms != null ? (t.response_time_ms / 1000).toFixed(3) : '',
            t.click_x != null ? t.click_x : '',
            t.click_y != null ? t.click_y : '',
            t.target_x != null ? t.target_x : '',
            t.target_y != null ? t.target_y : '',
            t.distance_px != null ? t.distance_px.toFixed(1) : '',
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

        sendJson(res, 200, {
          success: true,
          session_id: sessionId,
          json_file: jsonFilename,
          csv_file: csvFilename
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
    sendFile(res, filePath, MIME_TYPES[ext] || 'text/plain');
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

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Change Blindness Experiment System is running!`);
  console.log(` Web URL: http://localhost:${PORT}`);
  console.log(` Total stimuli pairs ready: ${allPairs.length}`);
  console.log(`=======================================================`);
});
