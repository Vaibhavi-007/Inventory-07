# Tobii Pro Fusion 120Hz Module for MERN Stack Experiments

A reusable, production-ready module to integrate the **Tobii Pro Fusion** (120 Hz) eye tracker into a **MERN (MongoDB, Express, React, Node.js)** cognitive psychology experiment.

## Architecture

In web-based cognitive psychology experiments, browser JavaScript cannot directly access USB eye-tracking hardware. This module solves that via a clean, high-performance bridge:

```
+-------------------------------------------------------------------+
|                           MERN Application                        |
|                                                                   |
|   [ React Frontend (Browser) ]                                    |
|         |                                                         |
|         | (WebSocket ws://localhost:8765/ws/tobii)                 |
|         v                                                         |
|   [ Python Driver Service (server.py) ]                           |
|         |                                                         |
|         | (Tobii Pro SDK / tobii_research at 120 Hz)              |
|         v                                                         |
|   [ Tobii Pro Fusion Eye Tracker ]                                |
+-------------------------------------------------------------------+
```

---

## Strict Validation Acceptance Criteria

In accordance with cognitive psychology standards, the module calculates:
1. **Data Loss (%):** Percentage of missing/invalid samples (blinks, loss of track).
   - **Threshold:** Must be strictly **0.0%**. If $> 0\%$, recalibration is triggered.
2. **Precision (Noise, RMS):** Root-mean-square angular deviation between consecutive samples during fixation.
   - **Threshold:** Must be $\le \mathbf{0.2^\circ}$. If $> 0.2^\circ$, recalibration is triggered.
3. **Accuracy (Offset):** Mean visual angle error between gaze point and target coordinate.
   - **Threshold:** Must be $\le \mathbf{0.5^\circ}$. If $> 0.5^\circ$, recalibration is triggered.

If **any** metric breaches these limits, the UI presents detailed diagnostic feedback and a prominent **Recalibrate Eye Tracker** button.

---

## Directory Structure

```
.
├── python_service/
│   ├── tobii_controller.py      # Core hardware driver, 120Hz setup, calibration & math
│   ├── server.py                # FastAPI & WebSocket bridge (ws://localhost:8765)
│   └── requirements.txt         # Dependencies
├── react_module/
│   ├── useTobii.js              # Reusable React hook for WebSocket communication
│   ├── TobiiCalibrationValidation.jsx # Full-screen calibration/validation UI & metrics
│   ├── TobiiStyles.css          # Lab dark-theme CSS & animated fixation targets
│   └── AppExample.jsx           # Example integration inside a MERN experiment app
└── README.md
```

---

## 1. Python Driver Service Setup

> [!IMPORTANT]
> The official Tobii Pro SDK wheel (`tobii-research`) on PyPI is compiled for **Python 3.10**. Ensure you use a Python 3.10 virtual environment or Conda environment.

```bash
# Create Python 3.10 environment
conda create -n tobii_fusion python=3.10 -y
conda activate tobii_fusion

# Install dependencies
cd python_service
pip install -r requirements.txt
pip install tobii-research

# Start the bridge server
python server.py
```

*Note:* If no physical eye tracker is attached, the service automatically runs in **Simulation / Mock Mode**, allowing you to develop and test your frontend without hardware.

---

## 2. React Integration (MERN Frontend)

Copy `react_module/` into your React project `src/components/tobii/`.

### Example Integration in your Experiment Page:

```jsx
import React, { useState } from "react";
import TobiiCalibrationValidation from "./components/tobii/TobiiCalibrationValidation";

export default function ExperimentRunner() {
  const [stage, setStage] = useState("CALIBRATION");
  const [validationData, setValidationData] = useState(null);

  const handleValidationPassed = (results) => {
    console.log("Validated successfully:", results);
    setValidationData(results);

    // Save validation metrics to Express / MongoDB backend
    fetch("/api/experiment/session/validation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectId: "SUBJ_001",
        metrics: results.metrics,
        timestamp: new Date(),
      }),
    });

    // Advance to cognitive tasks
    setStage("TASK_BLOCK_1");
  };

  return (
    <div>
      {stage === "CALIBRATION" && (
        <TobiiCalibrationValidation
          thresholds={{
            max_data_loss_pct: 0.0, // Strictly 0%
            max_precision_deg: 0.2, // <= 0.2°
            max_accuracy_deg: 0.5,  // <= 0.5°
          }}
          onValidationSuccess={handleValidationPassed}
        />
      )}

      {stage === "TASK_BLOCK_1" && (
        <div>
          {/* Cognitive psychology task components */}
        </div>
      )}
    </div>
  );
}
```

---

## Visual Angle Formulas Used

Visual angle error ($\theta$) in degrees is computed using the screen geometry:

$$\Delta x_{mm} = (\bar{x}_{gaze} - x_{target}) \times W_{screen}$$

$$\Delta y_{mm} = (\bar{y}_{gaze} - y_{target}) \times H_{screen}$$

$$d_{mm} = \sqrt{\Delta x_{mm}^2 + \Delta y_{mm}^2}$$

$$\theta = 2 \cdot \arctan\left(\frac{d_{mm}}{2 \cdot D_{distance}}\right) \times \frac{180}{\pi}$$

Precision is computed as Root Mean Square of sample-to-sample angular distance:

$$RMS = \sqrt{\frac{1}{N-1} \sum_{i=1}^{N-1} \theta(p_i, p_{i+1})^2}$$
