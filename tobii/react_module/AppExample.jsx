import React, { useState, useEffect } from "react";
import TobiiCalibrationValidation from "./TobiiCalibrationValidation";
import { useTobii } from "./useTobii";

/**
 * Example demonstrating how to use the high-precision calibrated Tobii model
 * inside an actual Cognitive Psychology Experiment web application.
 */
export default function AppExample() {
  const [phase, setPhase] = useState("CALIBRATION"); // "CALIBRATION" | "EXPERIMENT"
  const [sessionValidationMetrics, setSessionValidationMetrics] = useState(null);

  const handleValidationSuccess = (validationData) => {
    console.log("Validation passed! Storing metrics for MongoDB:", validationData);
    setSessionValidationMetrics(validationData);
    setPhase("EXPERIMENT");
  };

  return (
    <div>
      {phase === "CALIBRATION" && (
        <TobiiCalibrationValidation
          thresholds={{
            max_data_loss_pct: 0.0, // Strictly 0.0%
            max_precision_deg: 0.2, // <= 0.20 deg
            max_accuracy_deg: 0.5,  // <= 0.50 deg
          }}
          onValidationSuccess={handleValidationSuccess}
        />
      )}

      {phase === "EXPERIMENT" && (
        <CognitiveExperimentTrial
          validationMetrics={sessionValidationMetrics}
          onFinishExperiment={() => setPhase("CALIBRATION")}
        />
      )}
    </div>
  );
}

/**
 * Cognitive Psychology Experiment Task Phase (e.g. Visual Attention / AOI Fixation Task)
 * Uses the live 120Hz Calibrated Gaze Model via useTobii hook.
 */
function CognitiveExperimentTrial({ validationMetrics, onFinishExperiment }) {
  const { liveGaze, isGazeStreaming, startGazeStream, stopGazeStream, logEvent } = useTobii();
  const [trialCount, setTrialCount] = useState(1);
  const [stimulusAOI, setStimulusAOI] = useState("LEFT"); // "LEFT" | "RIGHT"
  const [targetFixated, setTargetFixated] = useState(false);

  // Automatically start 120Hz calibrated gaze stream when trial phase mounts
  useEffect(() => {
    startGazeStream();
    logEvent("TRIAL_PHASE_START", { trial: trialCount, aoi: stimulusAOI });
    return () => {
      stopGazeStream();
    };
  }, [startGazeStream, stopGazeStream, logEvent, trialCount, stimulusAOI]);

  // Real-time Area-of-Interest (AOI) fixation detector using calibrated coordinates
  useEffect(() => {
    if (!liveGaze.valid) return;
    const inLeftBox = liveGaze.x >= 0.15 && liveGaze.x <= 0.40 && liveGaze.y >= 0.35 && liveGaze.y <= 0.65;
    const inRightBox = liveGaze.x >= 0.60 && liveGaze.x <= 0.85 && liveGaze.y >= 0.35 && liveGaze.y <= 0.65;

    const hit = (stimulusAOI === "LEFT" && inLeftBox) || (stimulusAOI === "RIGHT" && inRightBox);
    setTargetFixated(hit);
  }, [liveGaze, stimulusAOI]);

  const handleNextTrial = () => {
    logEvent("TRIAL_COMPLETED", { trial: trialCount, targetFixated });
    setTrialCount((prev) => prev + 1);
    setStimulusAOI((prev) => (prev === "LEFT" ? "RIGHT" : "LEFT"));
  };

  return (
    <div style={{ padding: "30px", color: "#f8fafc", background: "#0c0d0e", minHeight: "100vh", position: "relative" }}>
      {/* Live Calibrated Gaze Point Overlay (Cursor) */}
      {isGazeStreaming && liveGaze.valid && (
        <div
          style={{
            position: "fixed",
            left: `${liveGaze.x * 100}%`,
            top: `${liveGaze.y * 100}%`,
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: "rgba(0, 210, 106, 0.6)",
            border: "2px solid #00d26a",
            boxShadow: "0 0 12px #00d26a",
            pointerEvents: "none",
            transform: "translate(-50%, -50%)",
            zIndex: 9999,
            transition: "left 0.02s linear, top 0.02s linear",
          }}
        />
      )}

      {/* Experiment Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #23252a", paddingBottom: "16px", marginBottom: "24px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Visual Attention Experiment — Trial #{trialCount}</h2>
          <div style={{ color: "#94a3b8", fontSize: "0.85rem", marginTop: "4px" }}>
            Model Status: <span style={{ color: "#00d26a", fontWeight: "bold" }}>Calibrated (120 Hz)</span> | Accuracy: {validationMetrics?.metrics?.accuracy_deg}&deg; | Precision: {validationMetrics?.metrics?.precision_deg}&deg;
          </div>
        </div>
        <button
          onClick={onFinishExperiment}
          style={{ background: "#23252a", border: "1px solid #333842", color: "#94a3b8", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
        >
          Recalibrate / Exit
        </button>
      </div>

      {/* Trial Stimulus Display Areas (AOIs) */}
      <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", height: "350px", marginTop: "40px" }}>
        {/* Left AOI */}
        <div
          style={{
            width: "280px",
            height: "220px",
            borderRadius: "12px",
            border: stimulusAOI === "LEFT" ? "3px solid #3b82f6" : "2px dashed #333842",
            background: stimulusAOI === "LEFT" ? "rgba(59, 130, 246, 0.12)" : "#141518",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: stimulusAOI === "LEFT" ? "0 0 24px rgba(59, 130, 246, 0.3)" : "none",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🎯</span>
          <span style={{ marginTop: "10px", fontWeight: "600" }}>{stimulusAOI === "LEFT" ? "Target Stimulus" : "Distractor"}</span>
        </div>

        {/* Right AOI */}
        <div
          style={{
            width: "280px",
            height: "220px",
            borderRadius: "12px",
            border: stimulusAOI === "RIGHT" ? "3px solid #3b82f6" : "2px dashed #333842",
            background: stimulusAOI === "RIGHT" ? "rgba(59, 130, 246, 0.12)" : "#141518",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: stimulusAOI === "RIGHT" ? "0 0 24px rgba(59, 130, 246, 0.3)" : "none",
          }}
        >
          <span style={{ fontSize: "2rem" }}>🧩</span>
          <span style={{ marginTop: "10px", fontWeight: "600" }}>{stimulusAOI === "RIGHT" ? "Target Stimulus" : "Distractor"}</span>
        </div>
      </div>

      {/* Live Biometric Status Bar */}
      <div style={{ display: "flex", gap: "24px", justifyContent: "center", marginTop: "30px", background: "#141518", padding: "14px", borderRadius: "8px", border: "1px solid #23252a", fontFamily: "monospace", fontSize: "0.85rem" }}>
        <span>Calibrated Gaze: <b>({liveGaze.x.toFixed(3)}, {liveGaze.y.toFixed(3)})</b></span>
        <span>Fixation on Target: <b style={{ color: targetFixated ? "#00d26a" : "#ef4444" }}>{targetFixated ? "YES" : "NO"}</b></span>
        <span>Left Pupil: <b>{liveGaze.left_pupil_mm ? `${liveGaze.left_pupil_mm} mm` : "--"}</b></span>
        <span>Right Pupil: <b>{liveGaze.right_pupil_mm ? `${liveGaze.right_pupil_mm} mm` : "--"}</b></span>
        <span>Distance: <b>{liveGaze.distance_cm} cm</b></span>
      </div>

      <div style={{ textAlign: "center", marginTop: "30px" }}>
        <button
          onClick={handleNextTrial}
          style={{ background: "#00d26a", color: "#0c0d0e", fontWeight: "bold", border: "none", padding: "12px 32px", borderRadius: "8px", cursor: "pointer", fontSize: "1rem" }}
        >
          Next Trial &rarr;
        </button>
      </div>
    </div>
  );
}
