#!/usr/bin/env python3
"""
Change Blindness Experiment Server (Python 3 Fallback)
Zero external dependencies required.
"""

import http.server
import socketserver
import os
import json
import urllib.parse
import mimetypes
import random
from datetime import datetime

PORT = int(os.environ.get('PORT', 3000))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, 'data', 'pairs.json')
RESULTS_DIR = os.path.join(BASE_DIR, 'results')
IMAGES_DIR = os.path.join(BASE_DIR, 'CBDatabase', 'Images')
MASKS_DIR = os.path.join(BASE_DIR, 'CBDatabase', 'Masks')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

os.makedirs(RESULTS_DIR, exist_ok=True)

# Load stimuli pairs
all_pairs = []
if os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        all_pairs = json.load(f)
    print(f"Loaded {len(all_pairs)} image pairs from {DATA_FILE}")

class ExperimentHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data, indent=2).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_file(self, file_path, content_type=None):
        if not os.path.isfile(file_path):
            self.send_response(404)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'404 Not Found')
            return

        if not content_type:
            content_type, _ = mimetypes.guess_type(file_path)
            if not content_type:
                content_type = 'application/octet-stream'

        try:
            with open(file_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'public, max-age=3600')
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode('utf-8'))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        pathname = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Health
        if pathname == '/api/health':
            self.send_json(200, {'status': 'ok', 'pairs_count': len(all_pairs)})
            return

        # Dataset info
        if pathname == '/api/dataset-info':
            fillers = [p for p in all_pairs if p.get('category') == 'filler']
            practice = [p for p in all_pairs if p.get('category') == 'practice']
            lefts = [p for p in all_pairs if p.get('side') == 'L']
            rights = [p for p in all_pairs if p.get('side') == 'R']

            self.send_json(200, {
                'total_pairs': len(all_pairs),
                'categories': {
                    'filler': len(fillers),
                    'practice': len(practice)
                },
                'sides': {
                    'left': len(lefts),
                    'right': len(rights),
                    'practice': len(practice)
                },
                'defaults': {
                    'n': 10,
                    't_interval_ms': 250,
                    'image_duration_ms': 1000,
                    'tolerance_px': 15,
                    'mode': 'single_transition'
                }
            })
            return

        # Pairs API
        if pathname == '/api/pairs':
            n = int(query.get('n', ['10'])[0])
            shuffle = query.get('shuffle', ['true'])[0].lower() != 'false'
            category = query.get('category', ['all'])[0]
            side = query.get('side', ['all'])[0]

            filtered = list(all_pairs)
            if category != 'all':
                filtered = [p for p in filtered if p.get('category') == category]
            if side != 'all':
                filtered = [p for p in filtered if p.get('side') == side]

            if shuffle:
                random.shuffle(filtered)

            n = max(1, min(len(filtered), n))
            selected = filtered[:n]

            self.send_json(200, {
                'count': len(selected),
                'total_available': len(filtered),
                'trials': selected
            })
            return

        # Images static: /images/...
        if pathname.startswith('/images/'):
            filename = os.path.basename(pathname)
            file_path = os.path.join(IMAGES_DIR, filename)
            self.serve_file(file_path, 'image/jpeg')
            return

        # Masks static: /masks/...
        if pathname.startswith('/masks/'):
            filename = os.path.basename(pathname)
            file_path = os.path.join(MASKS_DIR, filename)
            self.serve_file(file_path, 'image/png')
            return

        # Results static: /results/...
        if pathname.startswith('/results/'):
            filename = os.path.basename(pathname)
            file_path = os.path.join(RESULTS_DIR, filename)
            self.serve_file(file_path)
            return

        # Public web assets
        rel_path = 'index.html' if pathname == '/' else pathname.replace('/public/', '').lstrip('/')
        file_path = os.path.join(PUBLIC_DIR, rel_path)
        self.serve_file(file_path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        pathname = parsed.path

        if pathname == '/api/save-session':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                payload = json.loads(body)
                ts = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                session_id = payload.get('session_id', f'session_{ts}')
                json_path = os.path.join(RESULTS_DIR, f"{session_id}.json")
                csv_path = os.path.join(RESULTS_DIR, f"{session_id}.csv")

                # Save JSON
                with open(json_path, 'w', encoding='utf-8') as f:
                    json.dump(payload, f, indent=2)

                # Save CSV
                headers = [
                    'trial_number', 'pair_id', 'trial_str', 'category', 'side',
                    'object_name', 'accurate', 'response_time_ms', 'response_time_sec',
                    'click_x', 'click_y', 'target_x', 'target_y', 'distance_px',
                    'skipped', 'present_image', 'absent_image', 'mask_image',
                    't_interval_ms', 'image_duration_ms', 'mode', 'timestamp'
                ]
                csv_rows = [','.join(headers)]
                params = payload.get('parameters', {})
                for t in payload.get('trials', []):
                    rt = t.get('response_time_ms')
                    rt_str = f"{rt:.1f}" if rt is not None else ""
                    rt_sec_str = f"{(rt / 1000):.3f}" if rt is not None else ""
                    dist = t.get('distance_px')
                    dist_str = f"{dist:.1f}" if dist is not None else ""
                    row = [
                        str(t.get('trial_index', '')),
                        f'"{t.get("id", "")}"',
                        f'"{t.get("trial_str", "")}"',
                        f'"{t.get("category", "")}"',
                        f'"{t.get("side", "")}"',
                        f'"{t.get("object_name", "")}"',
                        "1" if t.get('accurate') else "0",
                        rt_str,
                        rt_sec_str,
                        str(t.get('click_x') if t.get('click_x') is not None else ""),
                        str(t.get('click_y') if t.get('click_y') is not None else ""),
                        str(t.get('target_x') if t.get('target_x') is not None else ""),
                        str(t.get('target_y') if t.get('target_y') is not None else ""),
                        dist_str,
                        "1" if t.get('skipped') else "0",
                        f'"{t.get("present_image", "")}"',
                        f'"{t.get("absent_image", "")}"',
                        f'"{t.get("mask_image", "")}"',
                        str(params.get('t_interval_ms', '')),
                        str(params.get('image_duration_ms', '')),
                        f'"{params.get("mode", "")}"',
                        f'"{payload.get("timestamp", "")}"'
                    ]
                    csv_rows.append(','.join(row))

                with open(csv_path, 'w', encoding='utf-8') as f:
                    f.write('\n'.join(csv_rows))

                self.send_json(200, {
                    'success': True,
                    'session_id': session_id,
                    'json_file': f"{session_id}.json",
                    'csv_file': f"{session_id}.csv"
                })
            except Exception as e:
                self.send_json(500, {'success': False, 'error': str(e)})

if __name__ == '__main__':
    class ReusableServer(socketserver.TCPServer):
        allow_reuse_address = True

    with ReusableServer(("", PORT), ExperimentHandler) as httpd:
        print(f"=======================================================")
        print(f" Change Blindness Experiment (Python server running)!")
        print(f" Web URL: http://localhost:{PORT}")
        print(f" Total stimuli pairs: {len(all_pairs)}")
        print(f"=======================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
