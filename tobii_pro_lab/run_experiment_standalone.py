"""
Change Blindness Experiment — Standalone Runner for Tobii Pro Lab
=================================================================
A zero-dependency standalone runner built with Python's standard Tkinter & Pillow,
fully integrated with Tobii Pro Lab via `tobii_research`.

Runs immediately on macOS, Windows, and Linux without requiring PsychoPy installation.

Features:
- Fullscreen / Windowed 1024x768 presentation
- Flicker cycle (240ms present, 80ms blank)
- Tutorial mode with instant feedback (Module 1 no questions, Modules 2 & 3 with recall questions)
- Modules 1, 2, and 3 (15 trials each = 45 total)
- Live 120Hz gaze recording and synchronization events for Tobii Pro Lab
- Exports Tobii Pro Lab Event TSV, Gaze TSV, and Multi-Sheet Behavioral Excel
"""

import os
import sys
import time
import json
import tkinter as tk
from tkinter import messagebox
from PIL import Image, ImageTk

try:
    from tobii_connector import TobiiProLabConnector
except ImportError:
    from .tobii_connector import TobiiProLabConnector


def check_mask_hit(mask_path, click_x_norm, click_y_norm, tolerance_px=15):
    if not os.path.exists(mask_path):
        return False
    try:
        mask_img = Image.open(mask_path).convert('RGB')
        w, h = mask_img.size
        cx = int(click_x_norm * w)
        cy = int(click_y_norm * h)
        rad = max(1, int(tolerance_px))
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if dx * dx + dy * dy <= rad * rad:
                    px = min(w - 1, max(0, cx + dx))
                    py = min(h - 1, max(0, cy + dy))
                    r, g, b = mask_img.getpixel((px, py))
                    if r < 128 and g < 128 and b < 128:
                        return True
        return False
    except Exception:
        return False


class ExperimentApp:
    def __init__(self, root, participant_id="P01", stream_gaze=True):
        self.root = root
        self.participant_id = participant_id
        self.stream_gaze = stream_gaze
        self.root.title(f"Change Blindness — Tobii Pro Lab [{participant_id}]")
        self.root.configure(bg="#000000")

        # Full screen or 1024x768
        self.sw = 1024
        self.sh = 768
        self.root.geometry(f"{self.sw}x{self.sh}")

        # Paths
        self.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.images_dir = os.path.join(self.root_dir, "CBDatabase", "Images")
        self.masks_dir = os.path.join(self.root_dir, "CBDatabase", "Masks")
        self.symbols_dir = os.path.join(self.root_dir, "public", "symbols")
        self.results_dir = os.path.join(self.root_dir, "results")
        os.makedirs(self.results_dir, exist_ok=True)

        # Load stimuli
        with open(os.path.join(self.root_dir, "data", "pairs.json"), 'r', encoding='utf-8') as f:
            all_pairs = json.load(f)
        self.pairs_by_id = {p['id']: p for p in all_pairs}

        with open(os.path.join(self.root_dir, "data_store", "module_pools.json"), 'r', encoding='utf-8') as f:
            self.module_pools = json.load(f)

        # Tobii Pro Lab Connector
        self.tobii = TobiiProLabConnector(output_dir=self.results_dir, stream_gaze=self.stream_gaze)
        self.tobii.connect()
        self.tobii.start_session(participant_id)

        # Canvas
        self.canvas = tk.Canvas(root, width=self.sw, height=self.sh, bg="#000000", highlightthickness=0)
        self.canvas.pack(fill=tk.BOTH, expand=True)

        self.canvas.bind("<Button-1>", self.on_click)
        self.root.bind("<Key>", self.on_key)

        # State machine
        self.state = "welcome"
        self.trial_queue = []
        self.curr_trial = None
        self.is_tutorial = False
        self.showing_present = True
        self.flicker_timer = None
        self.timeout_timer = None
        self.trial_start_time = 0
        self.results_all = []

        self.show_welcome_screen()

    def show_screen(self, title, body, prompt="Press SPACEBAR to continue →"):
        self.canvas.delete("all")
        self.canvas.create_text(self.sw // 2, 180, text=title, font=("Helvetica", 22, "bold"), fill="#ffffff")
        self.canvas.create_text(self.sw // 2, 340, text=body, font=("Helvetica", 14), fill="#cbd5e1", width=800, justify=tk.CENTER)
        self.canvas.create_text(self.sw // 2, 540, text=prompt, font=("Helvetica", 14, "bold"), fill="#fbbf24")

        # Center mouse cursor to screen center on every screen / instruction view
        try:
            self.root.event_generate('<Motion>', warp=True, x=self.sw // 2, y=self.sh // 2)
        except Exception:
            pass

    def show_welcome_screen(self):
        self.state = "welcome"
        body = (
            "Welcome to the Cognitive Psychology & Driver Attention Study.\n\n"
            "• You will spot subtle visual differences between alternating scenes.\n"
            "• Click directly on the difference as soon as you detect it.\n"
            "• In Modules 2 & 3, monitor dashboard instruments and answer recall questions.\n\n"
            "Before the actual test, you will complete a 6-sample Practice Tutorial.\n\n"
            f"Active Participant: {self.participant_id} | Tracker: {self.tobii.tracker_info['model']}"
        )
        self.show_screen("Change Blindness — Tobii Pro Lab Edition", body)

    def on_key(self, event):
        k = event.keysym.lower()
        if k == "escape":
            self.root.destroy()
            return

        if self.state == "welcome" and k in ["space", "return"]:
            self.start_tutorial()
        elif self.state == "tutorial_m1_intro" and k in ["space", "return"]:
            self.run_next_trial_in_queue()
        elif self.state == "tutorial_m2_intro" and k in ["space", "return"]:
            self.run_next_trial_in_queue()
        elif self.state == "tutorial_m3_intro" and k in ["space", "return"]:
            self.run_next_trial_in_queue()
        elif self.state == "tutorial_complete" and k in ["space", "return"]:
            self.start_actual_experiment()
        elif self.state == "trial_feedback" and k in ["space", "return"]:
            self.after_trial_feedback()
        elif self.state == "mcq" and k in ["1", "2", "3", "4"]:
            self.submit_mcq(int(k) - 1)
        elif self.state == "mcq_feedback" and k in ["space", "return"]:
            self.run_next_trial_in_queue()
        elif self.state == "module_done" and k in ["space", "return"]:
            self.run_next_trial_in_queue()
        elif self.state == "experiment_done" and k in ["space", "return"]:
            self.root.destroy()

    def start_tutorial(self):
        self.state = "tutorial_m1_intro"
        self.is_tutorial = True
        body = (
            "Module 1 contains scene flicker only (no car dashboard).\n\n"
            "• Scan the image and click the difference.\n"
            "• Practice data is NOT recorded in final results.\n"
            "• NO recall questions will be asked in Module 1 practice."
        )
        self.show_screen("Practice Tutorial: Module 1 (Flicker Paradigm)", body)
        self.trial_queue = [
            {"data": self.pairs_by_id['01_R_filler_mirror'], "module": 1, "is_tut": True, "ask_q": None},
            {"data": self.pairs_by_id['02_L_filler_napkin'], "module": 1, "is_tut": True, "ask_q": None, "next_intro": "tutorial_m2_intro"}
        ]

    def queue_module_2_tutorial(self):
        self.state = "tutorial_m2_intro"
        body = (
            "In Module 2, an automotive instrument cluster is displayed at the bottom.\n\n"
            "• Monitor speed, RPM, and warning symbols while finding differences.\n"
            "• You will now practice recall questions with immediate feedback."
        )
        self.show_screen("Practice Tutorial: Module 2 (Cluster Strip)", body)
        self.trial_queue = [
            {"data": self.pairs_by_id['03_R_filler_ducks'], "module": 2, "is_tut": True, 
             "ask_q": ("Dashboard Speed Recall", "What was the vehicle speed displayed on the dashboard meter?", ["48 km/h", "72 km/h", "86 km/h", "IDK / Unsure"], 1)},
            {"data": self.pairs_by_id['04_L_filler_electricalgrid'], "module": 2, "is_tut": True,
             "ask_q": ("Warning Symbol Recall", "Which warning symbol was illuminated on the cluster?", ["Brake Warning", "Seatbelt Warning", "Engine Check", "IDK / Unsure"], 1), "next_intro": "tutorial_m3_intro"}
        ]

    def queue_module_3_tutorial(self):
        self.state = "tutorial_m3_intro"
        body = (
            "In Module 3, instruments are projected as a floating HUD glass capsule.\n\n"
            "• The bottom area is blanked out.\n"
            "• Monitor the HUD and prepare for recall questions."
        )
        self.show_screen("Practice Tutorial: Module 3 (Heads-Up Display HUD)", body)
        self.trial_queue = [
            {"data": self.pairs_by_id['05_R_filler_mirror'], "module": 3, "is_tut": True,
             "ask_q": ("Engine RPM Recall", "What was the engine RPM displayed in the previous trial?", ["1.8k RPM", "2.6k RPM", "3.4k RPM", "IDK / Unsure"], 1)},
            {"data": self.pairs_by_id['06_L_filler_vase'], "module": 3, "is_tut": True,
             "ask_q": ("Vehicle Speed Recall", "What was the vehicle speed projected on the HUD?", ["64 km/h", "82 km/h", "98 km/h", "IDK / Unsure"], 0), "next_intro": "tutorial_complete"}
        ]

    def start_actual_experiment(self):
        self.is_tutorial = False
        self.trial_queue = []
        # Module 1 (15 trials)
        for t in self.module_pools['module_1']:
            self.trial_queue.append({"data": t, "module": 1, "is_tut": False, "ask_q": None})
        # Module 2 (15 trials)
        for t in self.module_pools['module_2']:
            self.trial_queue.append({"data": t, "module": 2, "is_tut": False, "ask_q": ("Speed Recall", "What was vehicle speed?", ["60 km/h", "75 km/h", "90 km/h", "IDK"], 1)})
        # Module 3 (15 trials)
        for t in self.module_pools['module_3']:
            self.trial_queue.append({"data": t, "module": 3, "is_tut": False, "ask_q": ("HUD Speed Recall", "What was vehicle speed?", ["60 km/h", "75 km/h", "90 km/h", "IDK"], 1)})

        self.run_next_trial_in_queue()

    def run_next_trial_in_queue(self):
        if not self.trial_queue:
            self.finish_experiment()
            return

        t_spec = self.trial_queue.pop(0)
        self.curr_spec = t_spec
        self.curr_trial = t_spec["data"]
        self.curr_module = t_spec["module"]
        self.is_tutorial = t_spec.get("is_tut", False)

        # Preload images
        p_path = os.path.join(self.images_dir, self.curr_trial['present_image'])
        a_path = os.path.join(self.images_dir, self.curr_trial['absent_image'])
        self.present_photo = ImageTk.PhotoImage(Image.open(p_path).resize((self.sw, self.sh)))
        self.absent_photo = ImageTk.PhotoImage(Image.open(a_path).resize((self.sw, self.sh)))

        # Start Gaze Stream
        self.tobii.log_event("TRIAL_START", {
            "trial_id": self.curr_trial['id'],
            "module": self.curr_module,
            "is_tutorial": self.is_tutorial
        })
        self.tobii.start_gaze_stream()

        self.state = "trial_active"
        self.showing_present = True
        self.trial_start_time = time.time()

        # Re-center mouse cursor to canvas center at trial start
        try:
            self.root.event_generate('<Motion>', warp=True, x=self.sw // 2, y=self.sh // 2)
        except Exception:
            pass

        self.step_flicker()

    def step_flicker(self):
        if self.state != "trial_active":
            return

        # Timeout 60s
        if time.time() - self.trial_start_time >= 60.0:
            self.handle_trial_timeout()
            return

        self.canvas.delete("all")
        if self.showing_present:
            self.canvas.create_image(0, 0, image=self.present_photo, anchor=tk.NW)
            self.flicker_timer = self.root.after(240, self.flicker_blank)
        else:
            self.canvas.create_image(0, 0, image=self.absent_photo, anchor=tk.NW)
            self.flicker_timer = self.root.after(240, self.flicker_blank)

    def flicker_blank(self):
        if self.state != "trial_active":
            return
        self.canvas.delete("all")  # Black screen
        self.showing_present = not self.showing_present
        self.flicker_timer = self.root.after(80, self.step_flicker)

    def on_click(self, event):
        if self.state != "trial_active":
            return

        rt_ms = round((time.time() - self.trial_start_time) * 1000, 1)
        norm_x = event.x / float(self.sw)
        norm_y = event.y / float(self.sh)

        mask_path = os.path.join(self.masks_dir, self.curr_trial['mask_image'])
        is_hit = check_mask_hit(mask_path, norm_x, norm_y, tolerance_px=15)

        self.tobii.stop_gaze_stream()
        self.tobii.log_event("MOUSE_CLICK", {
            "trial_id": self.curr_trial['id'],
            "hit": is_hit,
            "rt_ms": rt_ms,
            "x": norm_x,
            "y": norm_y
        })

        if self.flicker_timer:
            self.root.after_cancel(self.flicker_timer)

        # Immediately re-center mouse cursor to canvas center after each click
        try:
            self.root.event_generate('<Motion>', warp=True, x=self.sw // 2, y=self.sh // 2)
        except Exception:
            pass

        self.trial_result = {
            "id": self.curr_trial['id'],
            "module": self.curr_module,
            "hit": is_hit,
            "rt_ms": rt_ms
        }
        self.results_all.append(self.trial_result)

        if self.is_tutorial:
            self.show_tutorial_feedback(is_hit, rt_ms)
        else:
            self.advance_after_trial()

    def handle_trial_timeout(self):
        self.tobii.stop_gaze_stream()
        self.tobii.log_event("TRIAL_TIMEOUT", {"trial_id": self.curr_trial['id']})
        if self.flicker_timer:
            self.root.after_cancel(self.flicker_timer)

        # Immediately re-center mouse cursor to canvas center after each click
        try:
            self.root.event_generate('<Motion>', warp=True, x=self.sw // 2, y=self.sh // 2)
        except Exception:
            pass

        self.trial_result = {"id": self.curr_trial['id'], "module": self.curr_module, "hit": False, "rt_ms": 60000}
        self.results_all.append(self.trial_result)

        if self.is_tutorial:
            self.show_tutorial_feedback(False, 60000, timed_out=True)
        else:
            self.advance_after_trial()

    def show_tutorial_feedback(self, is_hit, rt_ms, timed_out=False):
        self.state = "trial_feedback"
        self.canvas.delete("all")
        self.canvas.create_image(0, 0, image=self.absent_photo, anchor=tk.NW)

        col = "#10b981" if is_hit else "#ef4444"
        txt = "✗ Timed out (60s)!" if timed_out else (f"✓ Correct! Difference detected" if is_hit else f"✗ Incorrect! Detection error")
        self.canvas.create_text(self.sw // 2, 60, text=txt, font=("Helvetica", 18, "bold"), fill=col)
        self.canvas.create_text(self.sw // 2, self.sh - 40, text="Press SPACEBAR to continue →", font=("Helvetica", 14, "bold"), fill="#fbbf24")

    def after_trial_feedback(self):
        ask_q = self.curr_spec.get("ask_q")
        if ask_q:
            self.present_mcq(ask_q)
        else:
            next_intro = self.curr_spec.get("next_intro")
            if next_intro == "tutorial_m2_intro":
                self.queue_module_2_tutorial()
            elif next_intro == "tutorial_m3_intro":
                self.queue_module_3_tutorial()
            elif next_intro == "tutorial_complete":
                self.state = "tutorial_complete"
                self.show_screen("🎉 Tutorial Complete — Ready for Actual Experiment",
                                 "You have completed practice for all 3 modules.\n\n"
                                 "• Real testing consists of 15 trials per module (45 total).\n"
                                 "• Gaze and events will be recorded for Tobii Pro Lab.\n\n"
                                 "Press SPACEBAR to begin Module 1.")
            else:
                self.run_next_trial_in_queue()

    def advance_after_trial(self):
        ask_q = self.curr_spec.get("ask_q")
        if ask_q:
            self.present_mcq(ask_q)
        else:
            self.run_next_trial_in_queue()

    def present_mcq(self, q_tuple):
        self.state = "mcq"
        self.q_tuple = q_tuple
        self.mcq_start_time = time.time()
        title, desc, opts, self.correct_idx = q_tuple

        # Center mouse cursor to canvas center while answering questions
        try:
            self.root.event_generate('<Motion>', warp=True, x=self.sw // 2, y=self.sh // 2)
        except Exception:
            pass

        self.tobii.log_event("MCQ_QUESTION_SHOWN", {"title": title})
        self.canvas.delete("all")
        self.canvas.create_text(self.sw // 2, 160, text=title, font=("Helvetica", 22, "bold"), fill="#ffffff")
        self.canvas.create_text(self.sw // 2, 220, text=desc, font=("Helvetica", 14), fill="#94a3b8")

        btn_y = [320, 390, 460, 530]
        for i, opt in enumerate(opts):
            self.canvas.create_rectangle(self.sw // 2 - 250, btn_y[i] - 22, self.sw // 2 + 250, btn_y[i] + 22, fill="#1e293b", outline="#334155")
            self.canvas.create_text(self.sw // 2, btn_y[i], text=f"[{i+1}]  {opt}", font=("Helvetica", 14), fill="#ffffff")

        self.canvas.create_text(self.sw // 2, 620, text="Press 1, 2, 3, or 4 on keyboard to answer", font=("Helvetica", 13, "bold"), fill="#fbbf24")

    def submit_mcq(self, chosen_idx):
        rt_sec = round(time.time() - getattr(self, 'mcq_start_time', time.time()), 3)
        rt_ms = round(rt_sec * 1000, 1)
        is_correct = (chosen_idx == self.correct_idx)
        opts = self.q_tuple[2]
        
        if hasattr(self, 'trial_result') and isinstance(self.trial_result, dict):
            self.trial_result["recall_rt_ms"] = rt_ms
            self.trial_result["recall_rt_sec"] = rt_sec
            self.trial_result["recall_accurate"] = is_correct

        self.tobii.log_event("MCQ_SUBMIT", {
            "chosen_index": chosen_idx + 1,
            "chosen_text": opts[chosen_idx],
            "correct": is_correct,
            "rt_ms": rt_ms,
            "rt_sec": rt_sec
        })

        if self.is_tutorial:
            self.state = "mcq_feedback"
            col = "#10b981" if is_correct else "#ef4444"
            msg = f"{'✓ Correct!' if is_correct else '✗ Incorrect!'} Correct answer: {opts[self.correct_idx]}"
            self.canvas.create_text(self.sw // 2, 590, text=msg, font=("Helvetica", 15, "bold"), fill=col)
            self.canvas.create_text(self.sw // 2, 630, text="Press SPACEBAR for Next Practice Sample →", font=("Helvetica", 13, "bold"), fill="#fbbf24")
        else:
            self.run_next_trial_in_queue()

    def finish_experiment(self):
        self.state = "experiment_done"
        ev_file, gz_file = self.tobii.export_tobii_pro_lab_tsv(self.participant_id)
        xlsx_file = self.tobii.export_behavioral_excel(self.participant_id, self.results_all)
        body = (
            "Thank you for participating!\n\n"
            "Data successfully recorded and exported:\n\n"
            f"• Tobii Event Log (.tsv): {os.path.basename(ev_file)}\n"
            f"• Tobii Gaze Data (.tsv): {os.path.basename(gz_file)}\n"
            f"• Excel Spreadsheet:      {os.path.basename(xlsx_file)}\n\n"
            "Press SPACEBAR to exit."
        )
        self.show_screen("Experiment Completed — Tobii Pro Lab Export Ready", body, prompt="Press SPACEBAR to close")


if __name__ == '__main__':
    pid = "P01"
    stream_gaze = True
    for arg in sys.argv[1:]:
        if arg in ('--events-only', '--no-gaze'):
            stream_gaze = False
        elif not arg.startswith('--'):
            pid = arg
    root = tk.Tk()
    app = ExperimentApp(root, participant_id=pid, stream_gaze=stream_gaze)
    root.mainloop()
