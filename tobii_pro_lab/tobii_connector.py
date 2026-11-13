"""
Tobii Pro Lab Eye Tracker Connector & Event Logger
===================================================
Provides native integration with Tobii Pro eye trackers (Tobii Pro Fusion, Spectrum,
Nano, TX300, etc.) via the official `tobii_research` Python SDK.

Features:
- Auto-discovery and connection to Tobii eye trackers
- High-precision 120Hz/60Hz gaze streaming with pupil diameter and validity
- Microsecond-accurate event logging compatible with Tobii Pro Lab timeline
- Export of Tobii Pro Lab native Event Data (.tsv) and Gaze Data (.tsv) files
- Simulation fallback when no physical tracker is connected
"""

import os
import sys
import time
import csv
from datetime import datetime

# Try importing official Tobii Research SDK
try:
    import tobii_research as tr
    TOBII_AVAILABLE = True
except ImportError:
    TOBII_AVAILABLE = False


class TobiiProLabConnector:
    def __init__(self, output_dir="results"):
        self.tracker = None
        self.is_mock = not TOBII_AVAILABLE
        self.tracker_info = {
            "model": "Simulation Mode",
            "serial": "SIM-000",
            "frequency": 120.0
        }
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

        self.gaze_samples = []
        self.events = []
        self.is_streaming = False
        self.session_start_time = None
        self.sync_time_offset = 0

    def connect(self):
        """Finds and connects to the first available Tobii eye tracker."""
        if not TOBII_AVAILABLE:
            print("[Tobii Pro Lab] 'tobii_research' SDK not found. Running in simulation mode.")
            self.is_mock = True
            return False

        try:
            eyetrackers = tr.find_all_eyetrackers()
            if not eyetrackers:
                print("[Tobii Pro Lab] No physical Tobii eye tracker detected on USB/Network. Running in simulation mode.")
                self.is_mock = True
                return False

            self.tracker = eyetrackers[0]
            self.is_mock = False
            self.tracker_info = {
                "model": self.tracker.model,
                "serial": self.tracker.serial_number,
                "frequency": getattr(self.tracker, "get_gaze_output_frequency", lambda: 120.0)()
            }
            print(f"[Tobii Pro Lab] Connected to {self.tracker_info['model']} (S/N: {self.tracker_info['serial']}, {self.tracker_info['frequency']} Hz)")
            return True
        except Exception as e:
            print(f"[Tobii Pro Lab] Connection error: {e}. Falling back to simulation.")
            self.is_mock = True
            return False

    def start_session(self, participant_id):
        self.participant_id = participant_id
        self.session_start_time = time.time()
        self.gaze_samples = []
        self.events = []

        # System sync timestamp
        if not self.is_mock and self.tracker:
            try:
                system_time = tr.get_system_time_stamp()
                self.sync_time_offset = system_time
            except Exception:
                self.sync_time_offset = int(time.time() * 1000000)
        else:
            self.sync_time_offset = int(time.time() * 1000000)

        self.log_event("SESSION_START", {"participant_id": participant_id})

    def start_gaze_stream(self):
        """Starts 120Hz gaze collection for a trial."""
        self.is_streaming = True
        if not self.is_mock and self.tracker:
            try:
                self.tracker.subscribe_to(tr.EYETRACKER_GAZE_DATA, self._on_gaze_data, as_dictionary=True)
            except Exception as e:
                print(f"[Tobii Pro Lab] Could not subscribe to gaze: {e}")

    def stop_gaze_stream(self):
        """Stops gaze stream at the end of a trial."""
        self.is_streaming = False
        if not self.is_mock and self.tracker:
            try:
                self.tracker.unsubscribe_from(tr.EYETRACKER_GAZE_DATA, self._on_gaze_data)
            except Exception:
                pass

    def _on_gaze_data(self, gaze_data):
        if not self.is_streaming:
            return

        # Microsecond timestamp relative to session sync
        t_us = gaze_data.get('device_time_stamp', int(time.time() * 1000000))
        rel_ms = (t_us - self.sync_time_offset) / 1000.0

        # Normalized coordinates (0..1)
        left = gaze_data.get('left_gaze_point_on_display_area', (None, None))
        right = gaze_data.get('right_gaze_point_on_display_area', (None, None))

        lx, ly = left if isinstance(left, (tuple, list)) else (None, None)
        rx, ry = right if isinstance(right, (tuple, list)) else (None, None)

        # Average gaze point
        gx, gy = None, None
        if lx is not None and rx is not None:
            gx = (lx + rx) / 2.0
            gy = (ly + ry) / 2.0
        elif lx is not None:
            gx, gy = lx, ly
        elif rx is not None:
            gx, gy = rx, ry

        sample = {
            "timestamp_us": t_us,
            "rel_time_ms": round(rel_ms, 2),
            "gaze_x": round(gx, 4) if gx is not None else "",
            "gaze_y": round(gy, 4) if gy is not None else "",
            "left_x": round(lx, 4) if lx is not None else "",
            "left_y": round(ly, 4) if ly is not None else "",
            "right_x": round(rx, 4) if rx is not None else "",
            "right_y": round(ry, 4) if ry is not None else "",
            "left_valid": 1 if lx is not None else 0,
            "right_valid": 1 if rx is not None else 0,
            "left_pupil": round(gaze_data.get('left_pupil_diameter', 0) or 0, 2),
            "right_pupil": round(gaze_data.get('right_pupil_diameter', 0) or 0, 2)
        }
        self.gaze_samples.append(sample)

    def log_event(self, event_name, data=None):
        """Logs a timestamped event compatible with Tobii Pro Lab timeline."""
        t_us = int(time.time() * 1000000)
        rel_ms = (t_us - self.sync_time_offset) / 1000.0 if self.session_start_time else 0.0

        event_entry = {
            "timestamp_us": t_us,
            "rel_time_ms": round(rel_ms, 2),
            "event": event_name,
            "details": data or {}
        }
        self.events.append(event_entry)

        # Optional: Send external trigger via TTL or Tobii Pro Lab External Presenter if available
        if not self.is_mock and self.tracker:
            # If the connected eye tracker has external signal ports (e.g. Spectrum/Fusion)
            pass

    def export_tobii_pro_lab_tsv(self, participant_id):
        """
        Exports Tobii Pro Lab compatible Event Data (.tsv) and Gaze Data (.tsv) files
        ready to be imported directly into Tobii Pro Lab:
        File -> Import -> Event Data / Gaze Data.
        """
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = os.path.join(self.output_dir, f"{participant_id}_{timestamp_str}")

        # 1. Tobii Pro Lab Event Data TSV
        events_tsv_path = f"{prefix}_tobii_events.tsv"
        with open(events_tsv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='\t')
            # Tobii Pro Lab Event Data Header
            writer.writerow(["Recording timestamp", "Event", "Event value", "Descriptor"])
            for ev in self.events:
                details_str = " | ".join(f"{k}={v}" for k, v in ev["details"].items()) if ev["details"] else ""
                writer.writerow([int(ev["rel_time_ms"] * 1000), ev["event"], details_str, "ExperimentEvent"])

        # 2. Tobii Pro Lab Gaze Data TSV
        gaze_tsv_path = f"{prefix}_tobii_gaze.tsv"
        with open(gaze_tsv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f, delimiter='\t')
            # Standard Tobii Pro Lab Gaze Export Columns
            writer.writerow([
                "Recording timestamp",
                "Gaze point X", "Gaze point Y",
                "Gaze point left X", "Gaze point left Y",
                "Gaze point right X", "Gaze point right Y",
                "Pupil diameter left", "Pupil diameter right",
                "Validity left", "Validity right"
            ])
            for g in self.gaze_samples:
                writer.writerow([
                    int(g["rel_time_ms"] * 1000),
                    g["gaze_x"], g["gaze_y"],
                    g["left_x"], g["left_y"],
                    g["right_x"], g["right_y"],
                    g["left_pupil"], g["right_pupil"],
                    g["left_valid"], g["right_valid"]
                ])

        print(f"[Tobii Pro Lab Export] Event file saved: {events_tsv_path}")
        print(f"[Tobii Pro Lab Export] Gaze file saved:  {gaze_tsv_path}")
        return events_tsv_path, gaze_tsv_path

    def export_behavioral_excel(self, participant_id, trial_results, summary=None):
        """
        Exports a multi-sheet Excel (.xlsx) file named directly after the participant:
        e.g. results/{participant_id}.xlsx
        """
        safe_pid = "".join(c for c in participant_id if c.isalnum() or c in ('_', '-')).strip() or "Anonymous"
        xlsx_path = os.path.join(self.output_dir, f"{safe_pid}.xlsx")

        try:
            import openpyxl
            wb = openpyxl.Workbook()

            # Sheet 1: Summary
            ws1 = wb.active
            ws1.title = "Summary"
            ws1.append(["Metric", "Value", "Description"])
            ws1.append(["Participant ID", participant_id, "Subject identifier"])
            ws1.append(["Tracker Hardware", self.tracker_info.get("model", "Tobii Eye Tracker"), f"{self.tracker_info.get('frequency', 120)} Hz"])
            ws1.append(["Total Trials", len(trial_results), "Trials completed"])

            hits = [t for t in trial_results if t.get("accurate") or t.get("hit")]
            acc_pct = round((len(hits) / max(1, len(trial_results))) * 100, 1)
            ws1.append(["Overall Accuracy", f"{acc_pct}%", f"{len(hits)} / {len(trial_results)} correct hits"])

            rts = [t.get("rt_ms") for t in trial_results if t.get("rt_ms") is not None and not t.get("timed_out")]
            mean_rt = round(sum(rts) / len(rts), 1) if rts else "--"
            ws1.append(["Mean Response Time", f"{mean_rt} ms" if mean_rt != "--" else "--", "Average detection latency"])

            # Recall Questions Mean RT
            recall_rts = [t.get("recall_rt_ms") for t in trial_results if t.get("recall_rt_ms") is not None]
            mean_recall_rt = round(sum(recall_rts) / len(recall_rts), 1) if recall_rts else "--"
            ws1.append(["Recall Questions Mean RT", f"{mean_recall_rt} ms" if mean_recall_rt != "--" else "--", "Average response latency for recall questions"])

            # Sheet 2: Module 1
            ws2 = wb.create_sheet(title="Module 1 - Behavior")
            ws2.append(["Trial #", "Participant ID", "Module", "Pair ID", "Object", "Visual Field", "Detection Hit (1/0)", "RT (ms)"])
            m1_trials = [t for t in trial_results if t.get("module") == 1 or t.get("module") == 'a']
            for i, t in enumerate(m1_trials):
                ws2.append([i + 1, participant_id, "Module 1 (Flicker)", t.get("id", ""), t.get("object_name", ""), t.get("side", ""), 1 if (t.get("accurate") or t.get("hit")) else 0, t.get("rt_ms", "")])

            # Sheet 3: Module 2
            ws3 = wb.create_sheet(title="Module 2 - Behavior")
            ws3.append(["Trial #", "Participant ID", "Module", "Pair ID", "Object", "Visual Field", "Detection Hit (1/0)", "RT (ms)", "Recall RT (ms)", "Recall RT (sec)", "Recall Hit (1/0)"])
            m2_trials = [t for t in trial_results if t.get("module") == 2 or t.get("module") == 'b']
            for i, t in enumerate(m2_trials):
                ws3.append([i + 1, participant_id, "Module 2 (Cluster Strip)", t.get("id", ""), t.get("object_name", ""), t.get("side", ""), 1 if (t.get("accurate") or t.get("hit")) else 0, t.get("rt_ms", ""), t.get("recall_rt_ms", ""), t.get("recall_rt_sec", ""), t.get("recall_accurate", "")])

            # Sheet 4: Module 3
            ws4 = wb.create_sheet(title="Module 3 - Behavior")
            ws4.append(["Trial #", "Participant ID", "Module", "Pair ID", "Object", "Visual Field", "Detection Hit (1/0)", "RT (ms)", "Recall RT (ms)", "Recall RT (sec)", "Recall Hit (1/0)"])
            m3_trials = [t for t in trial_results if t.get("module") == 3 or t.get("module") == 'c']
            for i, t in enumerate(m3_trials):
                ws4.append([i + 1, participant_id, "Module 3 (HUD)", t.get("id", ""), t.get("object_name", ""), t.get("side", ""), 1 if (t.get("accurate") or t.get("hit")) else 0, t.get("rt_ms", ""), t.get("recall_rt_ms", ""), t.get("recall_rt_sec", ""), t.get("recall_accurate", "")])

            # Sheet 5: All Trials Master Log
            ws5 = wb.create_sheet(title="All Trials")
            ws5.append(["Trial #", "Participant ID", "Module", "Pair ID", "Object", "Visual Field", "Detection Hit (1/0)", "RT (ms)", "Recall RT (ms)", "Recall RT (sec)", "Recall Hit (1/0)"])
            for i, t in enumerate(trial_results):
                mod_str = f"Module {t.get('module')}"
                ws5.append([i + 1, participant_id, mod_str, t.get("id", ""), t.get("object_name", ""), t.get("side", ""), 1 if (t.get("accurate") or t.get("hit")) else 0, t.get("rt_ms", ""), t.get("recall_rt_ms", ""), t.get("recall_rt_sec", ""), t.get("recall_accurate", "")])

            wb.save(xlsx_path)
            print(f"[Behavioral Export] Excel file saved: {xlsx_path}")
            return xlsx_path
        except Exception as e:
            print(f"[Behavioral Export] Could not write .xlsx via openpyxl ({e}). Falling back to CSV.")
            csv_path = os.path.join(self.output_dir, f"{safe_pid}.csv")
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow(["trial_index", "participant_id", "module", "pair_id", "object_name", "side", "hit", "rt_ms", "recall_rt_ms", "recall_rt_sec", "recall_accurate"])
                for i, t in enumerate(trial_results):
                    writer.writerow([i + 1, participant_id, t.get("module"), t.get("id"), t.get("object_name", ""), t.get("side", ""), 1 if (t.get("accurate") or t.get("hit")) else 0, t.get("rt_ms", ""), t.get("recall_rt_ms", ""), t.get("recall_rt_sec", ""), t.get("recall_accurate", "")])
            return csv_path
