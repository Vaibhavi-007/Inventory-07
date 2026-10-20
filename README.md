# Change Blindness Visual Experiment System

A high-precision, web-based psychophysics visual experiment platform designed to study **Change Blindness** using the Rensink visual search / flicker paradigm.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Vaibhavi-007/Inventory-07)

---

## 🚀 Quick Start

Run the experiment system using any of the following commands:

```bash
# Using the startup script:
./start.sh

# Or using Node.js:
node server.js

# Or using Python 3 (zero dependencies):
python3 server.py
```

Then open your browser at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📌 Experiment Protocol & Flow

1. **Landing Configuration**:
   - **Number of Images ($n$)**: Number of image pairs to present in the session (1 to 170). Quick preset chips: `5`, `10`, `20`, `50`, `All`.
   - **Interval Time ($t$ in ms)**: Duration of the blank black screen between stimuli to induce change blindness (e.g., `80ms`, `150ms`, `250ms`, `500ms`, `1000ms`).
   - **Present Image Duration (ms)**: Display time for the initial `_present` image (default: `1000ms`).
   - **Presentation Mode**:
     - **Single Transition** *(Default)*: Display `_present` image &rarr; Black screen for $t$ ms &rarr; Display `_absent` image (await click).
     - **Continuous Flicker**: Alternates Present &harr; Black for $t$ ms &harr; Absent &harr; Black for $t$ ms continuously until user responds.
   - **Click Tolerance Margin**: Configurable pixel radius (e.g. 15px) for hit detection on smaller objects.

2. **Trial Sequence**:
   - **Phase 1**: Initial image (`_present` keyword) displays the complete scene.
   - **Phase 2**: Blank black screen displays for interval $t$ ms.
   - **Phase 3**: Modified image (`_absent` keyword) displays where a single target object is missing.
   - **Response**: User clicks directly on the image where the difference was located.
     - **Response Time (RT)**: Measured in milliseconds with sub-millisecond precision (`window.performance.now()`).
     - **Accuracy (Hit / Miss)**: Evaluated against the ground-truth mask in `CBDatabase/Masks/`.
     - **Immediate Feedback**: Click marker appears (Green for Hit, Red for Miss) and outlines the true target difference.
   - **Spacebar Advance**: User presses <kbd>Spacebar</kbd> to record the trial and advance immediately to the next image pair.

3. **Results & Analytics Dashboard**:
   - **Summary KPIs**: Overall Accuracy (%), Mean Response Time (ms), Median Response Time (ms), Fastest Hit item & time.
   - **Cognitive Visual Field Analysis**: Breakdown of accuracy and RT across Left visual field ($L$) vs. Right visual field ($R$).
   - **Trial-by-Trial Table**: Detail of every trial, outcome, coordinates, benchmark comparison, and error distance.
   - **Trial Inspection Modal**: Inspect side-by-side present, absent with click location pin, and mask.
   - **Export Data**:
     - Instant browser download: **CSV** and **JSON**.
     - Auto-saved on the server under the `results/` folder for archival and research analysis.

---

## 🗄️ Database & Dataset Structure

- **Images (`CBDatabase/Images/`)**: 170 matched pairs ($85 \times 2$ conditions: Left/Right visual field), each with:
  - `*_present_*.jpg`: Image with object present.
  - `*_absent_*.jpg`: Image with object removed.
- **Masks (`CBDatabase/Masks/`)**: Exact 1024x768 binary masks matching each pair:
  - Background: White ($RGB > 200$)
  - Target object: Black ($RGB < 128$)
- **Benchmark Data (`data/pairs.json`)**: Pre-indexed metadata containing ground-truth coordinates $(X, Y)$, pixel area, eccentricity, and benchmark reaction times from the original Change Blindness database study.

---

## ⌨️ Controls & Shortcuts

| Action | Control |
|---|---|
| Start Experiment | <kbd>Click</kbd> or <kbd>Enter</kbd> |
| Identify Difference | <kbd>Left Mouse Click</kbd> |
| Advance to Next Image | <kbd>Spacebar</kbd> |
| Exit / Abort Session | <kbd>Esc</kbd> |
