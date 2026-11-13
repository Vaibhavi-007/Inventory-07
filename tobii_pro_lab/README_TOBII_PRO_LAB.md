# Change Blindness Experiment — Tobii Pro Lab Integration Guide

This directory contains the complete experiment codebase formatted specifically for **Tobii Pro Lab** (Tobii Pro Fusion, Spectrum, Nano, TX300, etc.) and **PsychoPy**.

---

## 📁 Directory Contents

```
tobii_pro_lab/
├── experiment_psycho_py.py        # Native PsychoPy experiment for Tobii Pro Lab External Presenter
├── run_experiment_standalone.py   # Standalone runner (zero-dependency, Pillow + Tkinter + Tobii)
├── tobii_connector.py             # Official Tobii Pro SDK (tobii_research) 120Hz/60Hz streaming & logger
├── requirements.txt               # Dependencies
└── README_TOBII_PRO_LAB.md        # This integration guide
```

---

## 🎯 Experiment Architecture

1. **Practice Tutorial (6 Samples Total)**:
   * **Module 1 Practice (2 samples)**: Flicker difference detection only, instant visual feedback, **NO recall questions**.
   * **Module 2 Practice (2 samples)**: Automotive Instrument Cluster Strip, Speed & Symbol recall questions with instant feedback.
   * **Module 3 Practice (2 samples)**: Heads-Up Display (HUD) capsule, RPM & Speed recall questions with instant feedback.
2. **Main Testing Session (45 Trials Total)**:
   * **Module 1 (15 trials)**: Basic Change Blindness Flicker Paradigm (240ms image, 80ms interval).
   * **Module 2 (15 trials)**: Cluster Strip at bottom with speedometer, tachometer, fuel, and warning symbols.
   * **Module 3 (15 trials)**: Heads-Up Display (HUD) capsule in 4th row, bottom area blacked out.

---

## 🚀 How to Run with Tobii Pro Lab

### Workflow Option A: Screen Recording in Tobii Pro Lab (Recommended)
This is the standard, most reliable workflow in Tobii Pro Lab:
1. Open **Tobii Pro Lab**.
2. Click **Create New Project** → select **Screen Recording**.
3. Select your connected Tobii eye tracker (e.g. Tobii Pro Fusion) and run the participant calibration in Tobii Pro Lab.
4. Click **Record**.
5. Launch the experiment in fullscreen:
   ```bash
   python tobii_pro_lab/run_experiment_standalone.py Participant_01
   # OR with PsychoPy:
   python tobii_pro_lab/experiment_psycho_py.py Participant_01
   ```
6. When the experiment finishes, stop the recording in Tobii Pro Lab.
7. Click **Import** → **Event Data** → select the generated `_tobii_events.tsv` file from the `results/` folder.
   * *Tobii Pro Lab will automatically sync all events (`TRIAL_START`, `STIMULUS_PRESENT`, `MOUSE_CLICK`, `RECALL_QUESTION`) onto the recording timeline!*

---

### Workflow Option B: External Presenter in Tobii Pro Lab
If your Tobii Pro Lab license includes the **External Presenter** module:
1. Open **Tobii Pro Lab**.
2. Click **Create New Project** → select **External Presenter**.
3. In Project Settings, point the external presenter command to:
   ```bash
   python tobii_pro_lab/experiment_psycho_py.py
   ```
4. Perform calibration inside Tobii Pro Lab.
5. Click **Record** — Tobii Pro Lab will automatically launch the script, stream gaze data via `tobii_research`, and log all stimuli events directly into the project timeline.

---

## 📊 Output Files & Analysis

All session results are saved in the `results/` directory:
1. **`{PARTICIPANT}_{TIMESTAMP}_tobii_events.tsv`**:
   - Tobii Pro Lab native event format (`Recording timestamp`, `Event`, `Event value`, `Descriptor`).
2. **`{PARTICIPANT}_{TIMESTAMP}_tobii_gaze.tsv`**:
   - 120Hz raw gaze stream with pupil diameters and validity codes.
3. **`session_{TIMESTAMP}.xlsx`**:
   - Multi-sheet behavioral results workbook:
     - **Sheet 1**: Summary & Detection Accuracies
     - **Sheet 2**: Module 1 Trials
     - **Sheet 3**: Module 2 Trials & Recall MCQs
     - **Sheet 4**: Module 3 Trials & Recall MCQs
     - **Sheet 5**: Master 45-Trial Benchmark Log

---

## 📦 Installation

To install the required Python libraries on your testing computer:
```bash
pip install -r tobii_pro_lab/requirements.txt
```
*(If running on an Anaconda environment with Python 3.10+, `tobii_research` is supported natively).*
