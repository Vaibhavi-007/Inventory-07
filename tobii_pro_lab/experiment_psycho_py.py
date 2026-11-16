"""
Change Blindness Experiment — Tobii Pro Lab & PsychoPy Native Edition
======================================================================
Fully compliant with Tobii Pro Lab External Presenter and PsychoPy Runner.

Architecture:
1. Practice Tutorial (6 samples total):
   - Module 1 Practice (2 samples): Flicker detection only, instant feedback, NO questions.
   - Module 2 Practice (2 samples): Cluster strip, Speed & Symbol recall questions with instant feedback.
   - Module 3 Practice (2 samples): HUD capsule, RPM & Speed recall questions with instant feedback.
2. Main Testing Session (45 trials total across 3 fixed blocks):
   - Module 1 (15 trials): Scene Flicker Paradigm (240ms present, 80ms interval).
   - Module 2 (15 trials): Automotive Instrument Cluster Strip at bottom.
   - Module 3 (15 trials): Heads-Up Display (HUD) capsule in 4th row, bottom blacked out.
3. Tobii Pro Lab Integration:
   - High-precision 120Hz/60Hz gaze streaming via official `tobii_research` SDK.
   - Synchronized event markers sent to Tobii Pro Lab timeline.
   - Auto-exports Tobii Pro Lab Event Data (.tsv) & Gaze Data (.tsv) and comprehensive multi-sheet Excel (.xlsx).
"""

import os
import sys
import time
import json
import random
import math
from datetime import datetime
from PIL import Image

# Import Tobii Pro Lab connector
try:
    from tobii_connector import TobiiProLabConnector
except ImportError:
    from .tobii_connector import TobiiProLabConnector

# Try importing PsychoPy
try:
    from psychopy import visual, core, event, gui, sound
    PSYCHOPY_AVAILABLE = True
except ImportError:
    PSYCHOPY_AVAILABLE = False


def check_mask_hit(mask_path, click_x_norm, click_y_norm, tolerance_px=15):
    """
    Checks if click point hits the target difference on the mask image.
    click_x_norm and click_y_norm are in range 0..1 (from top-left).
    """
    if not os.path.exists(mask_path):
        return False
    try:
        mask_img = Image.open(mask_path).convert('RGB')
        w, h = mask_img.size
        cx = int(click_x_norm * w)
        cy = int(click_y_norm * h)

        # Check neighborhood within tolerance radius
        rad = max(1, int(tolerance_px))
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if dx * dx + dy * dy <= rad * rad:
                    px = min(w - 1, max(0, cx + dx))
                    py = min(h - 1, max(0, cy + dy))
                    r, g, b = mask_img.getpixel((px, py))
                    if r < 128 and g < 128 and b < 128:  # Target area is black (<128)
                        return True
        return False
    except Exception as e:
        print(f"Error checking mask: {e}")
        return False


def run_experiment(participant_id="P01", fullscreen=True, stream_gaze=True):
    if not PSYCHOPY_AVAILABLE:
        print("\n" + "=" * 60)
        print(" [ERROR] PsychoPy is not installed in this Python environment.")
        print(" To run inside Tobii Pro Lab with PsychoPy, please install:")
        print("    pip install psychopy tobii-research pillow openpyxl")
        print(" Or use the standalone GUI launcher: python run_experiment_standalone.py")
        print("=" * 60 + "\n")
        return

    # Paths configuration
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    images_dir = os.path.join(root_dir, "CBDatabase", "Images")
    masks_dir = os.path.join(root_dir, "CBDatabase", "Masks")
    symbols_dir = os.path.join(root_dir, "public", "symbols")
    data_file = os.path.join(root_dir, "data", "pairs.json")
    pools_file = os.path.join(root_dir, "data_store", "module_pools.json")
    results_dir = os.path.join(root_dir, "results")
    os.makedirs(results_dir, exist_ok=True)

    # Load pairs data
    with open(data_file, 'r', encoding='utf-8') as f:
        all_pairs = json.load(f)
    pairs_by_id = {p['id']: p for p in all_pairs}

    # Load module pools (15 fixed trials per module)
    with open(pools_file, 'r', encoding='utf-8') as f:
        module_pools = json.load(f)

    # Initialize Tobii Pro Lab Eye Tracker Connector
    tobii = TobiiProLabConnector(output_dir=results_dir, stream_gaze=stream_gaze)
    tobii.connect()
    tobii.start_session(participant_id)

    # Create PsychoPy Window (1024x768 stimulus canvas, full screen)
    win = visual.Window(
        size=(1024, 768),
        units='pix',
        color=[-1, -1, -1],  # Black background
        fullscr=fullscreen,
        allowGUI=False
    )
    mouse = event.Mouse(win=win)

    # --- UI Elements ---
    title_text = visual.TextStim(win, text="", pos=(0, 200), color='white', height=28, bold=True)
    body_text = visual.TextStim(win, text="", pos=(0, 0), color='#cbd5e1', height=20, wrapWidth=850)
    prompt_text = visual.TextStim(win, text="Press SPACEBAR to continue →", pos=(0, -260), color='#fbbf24', height=20, bold=True)

    stim_img = visual.ImageStim(win, size=(1024, 768), pos=(0, 0))
    feedback_text = visual.TextStim(win, text="", pos=(0, -320), color='white', height=22, bold=True)
    
    # -------------------------------------------------------------
    # Helper: Show Instruction / Transition Screen
    # -------------------------------------------------------------
    def show_screen(title, body, wait_key='space'):
        title_text.text = title
        body_text.text = body
        prompt_text.text = f"Press {wait_key.upper()} to continue →"
        while True:
            title_text.draw()
            body_text.draw()
            prompt_text.draw()
            win.flip()
            keys = event.getKeys()
            if 'escape' in keys:
                core.quit()
            if wait_key in keys:
                break
            core.wait(0.01)

    # -------------------------------------------------------------
    # Helper: Multiple Choice Recall Question
    # -------------------------------------------------------------
    def ask_mcq_question(question_title, question_desc, options, correct_idx, is_tutorial=False):
        """Presents a 4-choice recall question (1..4 keyboard or mouse click)."""
        q_title = visual.TextStim(win, text=question_title, pos=(0, 220), color='white', height=26, bold=True)
        q_desc = visual.TextStim(win, text=question_desc, pos=(0, 160), color='#94a3b8', height=20)
        
        btn_stims = []
        btn_y = [80, 10, -60, -130]
        for i, opt in enumerate(options):
            b_box = visual.Rect(win, width=600, height=50, pos=(0, btn_y[i]), fillColor=[-0.8, -0.8, -0.8], lineColor=[0.2, 0.2, 0.2])
            b_txt = visual.TextStim(win, text=f"[{i+1}]  {opt}", pos=(0, btn_y[i]), color='white', height=19)
            btn_stims.append((b_box, b_txt))

        q_hint = visual.TextStim(win, text="Press 1, 2, 3, or 4 on keyboard to answer", pos=(0, -220), color='#fbbf24', height=18)

        tobii.log_event("MCQ_QUESTION_SHOWN", {"title": question_title})
        chosen_idx = None
        start_time = core.getTime()

        while chosen_idx is None:
            q_title.draw()
            q_desc.draw()
            q_hint.draw()
            for b_box, b_txt in btn_stims:
                b_box.draw()
                b_txt.draw()
            win.flip()

            keys = event.getKeys()
            if 'escape' in keys:
                core.quit()
            for k in ['1', '2', '3', '4']:
                if k in keys:
                    chosen_idx = int(k) - 1
                    break

            if mouse.getPressed()[0]:
                m_pos = mouse.getPos()
                for i, (b_box, _) in enumerate(btn_stims):
                    if b_box.contains(m_pos):
                        chosen_idx = i
                        break
            core.wait(0.01)

        is_correct = (chosen_idx == correct_idx)
        resp_time = round((core.getTime() - start_time) * 1000, 1)

        tobii.log_event("MCQ_ANSWER_SUBMITTED", {
            "chosen_index": chosen_idx + 1,
            "chosen_text": options[chosen_idx],
            "is_correct": is_correct,
            "rt_ms": resp_time,
            "rt_sec": round(resp_time / 1000.0, 3)
        })

        # Tutorial Feedback Banner
        if is_tutorial:
            fb_col = '#10b981' if is_correct else '#ef4444'
            fb_msg = f"{'✓ Correct!' if is_correct else '✗ Incorrect!'} Correct answer was: {options[correct_idx]}"
            t_fb = visual.TextStim(win, text=fb_msg, pos=(0, -200), color=fb_col, height=20, bold=True)
            t_cont = visual.TextStim(win, text="Press SPACEBAR for Next Practice Sample →", pos=(0, -250), color='#fbbf24', height=18)
            
            while True:
                q_title.draw()
                for i, (b_box, b_txt) in enumerate(btn_stims):
                    if i == correct_idx:
                        b_box.lineColor = [0.1, 0.8, 0.4]
                        b_box.lineWidth = 3
                    if i == chosen_idx and not is_correct:
                        b_box.lineColor = [0.9, 0.2, 0.2]
                    b_box.draw()
                    b_txt.draw()
                t_fb.draw()
                t_cont.draw()
                win.flip()
                k = event.getKeys()
                if 'space' in k or 'return' in k:
                    break
                core.wait(0.01)

        return chosen_idx, is_correct, resp_time

    # -------------------------------------------------------------
    # Core Trial Runner (Flicker Loop)
    # -------------------------------------------------------------
    def run_trial(trial_data, module_num, is_tutorial=False):
        present_path = os.path.join(images_dir, trial_data['present_image'])
        absent_path = os.path.join(images_dir, trial_data['absent_image'])
        mask_path = os.path.join(masks_dir, trial_data['mask_image'])

        # Start Tobii Gaze Streaming for this trial
        tobii.log_event("TRIAL_START", {
            "trial_id": trial_data['id'],
            "module": module_num,
            "is_tutorial": is_tutorial,
            "object": trial_data.get('object_name', '')
        })
        tobii.start_gaze_stream()

        # Center mouse cursor
        mouse.setPos((0, 0))

        # Flicker timing (seconds)
        img_duration = 0.240  # 240 ms
        blank_duration = 0.080 # 80 ms
        timeout_sec = 60.0

        showing_present = True
        trial_start_time = core.getTime()
        click_detected = False
        click_x_norm = None
        click_y_norm = None
        click_rt = None
        is_hit = False

        while core.getTime() - trial_start_time < timeout_sec:
            # 1. Present Stimulus Image
            curr_img_path = present_path if showing_present else absent_path
            stim_img.image = curr_img_path
            stim_img.draw()
            win.flip()
            
            phase_start = core.getTime()
            while core.getTime() - phase_start < img_duration:
                if mouse.getPressed()[0]:
                    click_pos = mouse.getPos()
                    # Convert PsychoPy pixels (-512..512, -384..384) to normalized (0..1 from top-left)
                    click_x_norm = (click_pos[0] + 512.0) / 1024.0
                    click_y_norm = (384.0 - click_pos[1]) / 768.0
                    click_rt = round((core.getTime() - trial_start_time) * 1000, 1)
                    is_hit = check_mask_hit(mask_path, click_x_norm, click_y_norm, tolerance_px=15)
                    click_detected = True
                    break
                if 'escape' in event.getKeys():
                    core.quit()
                core.wait(0.002)

            if click_detected:
                break

            # 2. Blank Interval
            win.flip()  # Blank screen
            phase_start = core.getTime()
            while core.getTime() - phase_start < blank_duration:
                if 'escape' in event.getKeys():
                    core.quit()
                core.wait(0.002)

            showing_present = not showing_present

        # End Gaze Stream for this trial
        tobii.stop_gaze_stream()
        tobii.log_event("TRIAL_END", {
            "trial_id": trial_data['id'],
            "hit": is_hit,
            "rt_ms": click_rt,
            "timed_out": not click_detected
        })

        # Tutorial Feedback Overlay
        if is_tutorial:
            stim_img.image = absent_path
            stim_img.draw()
            fb_col = '#10b981' if is_hit else '#ef4444'
            fb_txt = f"{'✓ Correct!' if is_hit else '✗ Incorrect!'} Detection RT: {click_rt} ms" if click_detected else "✗ Timed out (60s)!"
            feedback_text.text = fb_txt
            feedback_text.color = fb_col
            feedback_text.draw()
            prompt_text.text = "Press SPACEBAR to continue →"
            prompt_text.draw()
            win.flip()
            event.waitKeys(keyList=['space', 'return'])

        return {
            "id": trial_data['id'],
            "module": module_num,
            "accurate": 1 if is_hit else 0,
            "rt_ms": click_rt,
            "timed_out": not click_detected,
            "click_x": click_x_norm,
            "click_y": click_y_norm
        }

    # =============================================================
    # 1. WELCOME SCREEN
    # =============================================================
    show_screen(
        "Change Blindness Experiment — Tobii Pro Lab Edition",
        "Welcome to the Cognitive Psychology & Driver Attention Study.\n\n"
        "• You will spot subtle visual differences between alternating scenes.\n"
        "• Click directly on the difference as soon as you detect it.\n"
        "• In Modules 2 & 3, monitor dashboard instruments and answer recall questions.\n\n"
        "Before the actual test, you will complete a 6-sample Practice Tutorial.\n"
        f"Active Participant: {participant_id}"
    )

    # =============================================================
    # 2. TUTORIAL SAMPLES (2 per module)
    # =============================================================
    show_screen(
        "Practice Tutorial: Module 1 (Flicker Paradigm)",
        "Module 1 contains scene flicker only (no car dashboard).\n\n"
        "• Scan the image and click the difference.\n"
        "• Practice data is NOT recorded in final results.\n"
        "• NO recall questions will be asked in Module 1 practice."
    )
    # Tutorial Module 1 (2 samples)
    t_m1_samples = [pairs_by_id['01_R_filler_mirror'], pairs_by_id['02_L_filler_napkin']]
    for s in t_m1_samples:
        run_trial(s, module_num=1, is_tutorial=True)

    show_screen(
        "Practice Tutorial: Module 2 (Cluster Strip)",
        "In Module 2, an automotive instrument cluster is displayed at the bottom.\n\n"
        "• Monitor speed, RPM, and warning symbols while finding differences.\n"
        "• You will now practice recall questions with immediate feedback."
    )
    # Tutorial Module 2 (2 samples + questions)
    t_m2_samples = [pairs_by_id['03_R_filler_ducks'], pairs_by_id['04_L_filler_electricalgrid']]
    run_trial(t_m2_samples[0], module_num=2, is_tutorial=True)
    ask_mcq_question("Dashboard Speed Recall", "What was the vehicle speed displayed on the dashboard meter?", ["48 km/h", "72 km/h", "86 km/h", "IDK / Unsure"], 1, is_tutorial=True)

    run_trial(t_m2_samples[1], module_num=2, is_tutorial=True)
    ask_mcq_question("Warning Symbol Recall", "Which warning symbol was illuminated on the cluster?", ["Brake Warning", "Seatbelt Warning", "Engine Check", "IDK / Unsure"], 1, is_tutorial=True)

    show_screen(
        "Practice Tutorial: Module 3 (Heads-Up Display HUD)",
        "In Module 3, instruments are projected as a floating HUD glass capsule.\n\n"
        "• The bottom area is blanked out.\n"
        "• Monitor the HUD and prepare for recall questions."
    )
    # Tutorial Module 3 (2 samples + questions)
    t_m3_samples = [pairs_by_id['05_R_filler_mirror'], pairs_by_id['06_L_filler_vase']]
    run_trial(t_m3_samples[0], module_num=3, is_tutorial=True)
    ask_mcq_question("Engine RPM Recall", "What was the engine RPM displayed in the previous trial?", ["1.8k RPM", "2.6k RPM", "3.4k RPM", "IDK / Unsure"], 1, is_tutorial=True)

    run_trial(t_m3_samples[1], module_num=3, is_tutorial=True)
    ask_mcq_question("Vehicle Speed Recall", "What was the vehicle speed projected on the HUD?", ["64 km/h", "82 km/h", "98 km/h", "IDK / Unsure"], 0, is_tutorial=True)

    # =============================================================
    # 3. ACTUAL EXPERIMENT (15 trials per module = 45 total)
    # =============================================================
    show_screen(
        "🎉 Tutorial Complete — Ready for Actual Experiment",
        "You have finished the practice tutorial.\n\n"
        "• The real experiment consists of 15 trials per module (45 trials total).\n"
        "• Eye tracking data and event markers will be recorded for Tobii Pro Lab.\n\n"
        "Press SPACEBAR to begin Module 1."
    )

    results_all = []
    
    # Run Module 1 (15 trials)
    for t_data in module_pools['module_1']:
        res = run_trial(t_data, module_num=1, is_tutorial=False)
        results_all.append(res)

    show_screen("Module 1 Complete", "Great job! Next is Module 2 (Cluster Strip).\n\nPress SPACEBAR to continue.")
    # Run Module 2 (15 trials)
    for idx, t_data in enumerate(module_pools['module_2']):
        res = run_trial(t_data, module_num=2, is_tutorial=False)
        # Probe recall questions on 40% of trials (e.g. idx 0, 3, 6, 9, 12)
        if idx % 3 == 0:
            c_idx, is_corr, q_rt = ask_mcq_question(
                "Module 2 Recall Question",
                "What was the vehicle speed or instrument state in the preceding scene?",
                ["48 km/h", "72 km/h", "86 km/h", "IDK / Unsure"],
                1,
                is_tutorial=False
            )
            res["recall_rt_ms"] = q_rt
            res["recall_rt_sec"] = round(q_rt / 1000.0, 3)
            res["recall_accurate"] = 1 if is_corr else 0
        results_all.append(res)

    show_screen("Module 2 Complete", "Great job! Final block is Module 3 (Heads-Up Display HUD).\n\nPress SPACEBAR to continue.")
    # Run Module 3 (15 trials)
    for idx, t_data in enumerate(module_pools['module_3']):
        res = run_trial(t_data, module_num=3, is_tutorial=False)
        # Probe recall questions on 40% of trials
        if idx % 3 == 0:
            c_idx, is_corr, q_rt = ask_mcq_question(
                "Module 3 HUD Recall Question",
                "What was the projected HUD parameter (Speed / RPM) in the preceding trial?",
                ["2.4k RPM", "3.2k RPM", "4.0k RPM", "IDK / Unsure"],
                0,
                is_tutorial=False
            )
            res["recall_rt_ms"] = q_rt
            res["recall_rt_sec"] = round(q_rt / 1000.0, 3)
            res["recall_accurate"] = 1 if is_corr else 0
        results_all.append(res)

    # =============================================================
    # 4. EXPORT TOBII PRO LAB DATA & CLOSE
    # =============================================================
    tobii.log_event("SESSION_COMPLETE", {"total_trials": len(results_all)})
    events_tsv, gaze_tsv = tobii.export_tobii_pro_lab_tsv(participant_id)
    xlsx_file = tobii.export_behavioral_excel(participant_id, results_all)

    show_screen(
        "Experiment Completed!",
        f"Thank you for participating!\n\n"
        f"Data successfully recorded and exported:\n"
        f"• Tobii Pro Lab Events: {os.path.basename(events_tsv)}\n"
        f"• Tobii Pro Lab Gaze:   {os.path.basename(gaze_tsv)}\n"
        f"• Excel Spreadsheet:    {os.path.basename(xlsx_file)}\n\n"
        "Press SPACEBAR to exit."
    )

    win.close()
    print("[Tobii Pro Lab] Experiment successfully finished.")


if __name__ == '__main__':
    pid = "P01"
    stream_gaze = True
    for arg in sys.argv[1:]:
        if arg in ('--events-only', '--no-gaze'):
            stream_gaze = False
        elif not arg.startswith('--'):
            pid = arg
    run_experiment(participant_id=pid, fullscreen=False, stream_gaze=stream_gaze)
