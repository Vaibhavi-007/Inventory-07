import React, { useState } from "react";
import { useTobii, DEFAULT_POINTS } from "./useTobii";
import "./TobiiStyles.css";

/**
 * TobiiCalibrationValidation Component
 *
 * Implements standard cognitive psychology calibration and validation for Tobii Pro Fusion.
 *
 * Strict Criteria:
 * - Data Loss: strictly 0% (if > 0%, recalibrate)
 * - Precision: <= 0.2° (if > 0.2°, recalibrate)
 * - Accuracy: <= 0.5° (if > 0.5°, recalibrate)
 *
 * @param {Function} onValidationSuccess - Callback fired when all criteria pass and user proceeds.
 * @param {Array} points - Array of points [{id, x, y}] in normalized coordinates [0.0 - 1.0].
 * @param {Object} thresholds - Validation threshold cutoffs.
 */
export default function TobiiCalibrationValidation({
  onValidationSuccess = (result) => console.log("Validation passed:", result),
  points = DEFAULT_POINTS,
  thresholds = {
    max_data_loss_pct: 0.0,
    max_precision_deg: 0.2,
    max_accuracy_deg: 0.5,
  },
}) {
  const {
    isConnected,
    trackerStatus,
    flowState,
    currentPointIndex,
    validationResult,
    errorMsg,
    startCalibrationFlow,
    startValidationFlow,
    resetAll,
  } = useTobii();

  const [stepMessage, setStepMessage] = useState("");

  // Start complete sequence: Calibration -> Validation
  const handleStartSequence = async () => {
    try {
      setStepMessage("Calibrating: Follow the pulsating dot with your eyes...");
      await startCalibrationFlow(points, 1500);

      setStepMessage("Validating: Fixate steadily on each dot...");
      await startValidationFlow(points, 1200, thresholds);
    } catch (err) {
      console.error("Sequence error:", err);
    }
  };

  // Re-trigger calibration if validation thresholds were not satisfied
  const handleRecalibrate = () => {
    resetAll();
    handleStartSequence();
  };

  const currentPoint = currentPointIndex >= 0 ? points[currentPointIndex] : null;

  return (
    <div className="tobii-container">
      {/* ----------------------------------------------------------------- */}
      {/* Active Animated Target During Calibration & Validation            */}
      {/* ----------------------------------------------------------------- */}
      {(flowState === "CALIBRATING" || flowState === "VALIDATING") && (
        <>
          <div className="tobii-live-guide">
            {flowState === "CALIBRATING" ? "Calibration Phase" : "Validation Phase"} (
            {currentPointIndex + 1} of {points.length}) — Fixate on the dot
          </div>

          {currentPoint && (
            <div
              className="tobii-target-anchor"
              style={{
                left: `${currentPoint.x * 100}%`,
                top: `${currentPoint.y * 100}%`,
              }}
            >
              <div className="tobii-outer-ring">
                <div className="tobii-inner-dot" />
              </div>
            </div>
          )}
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Initial Start Screen                                              */}
      {/* ----------------------------------------------------------------- */}
      {flowState === "IDLE" && (
        <div className="tobii-card">
          <h2 className="tobii-title">Eye Tracker Calibration</h2>
          <p className="tobii-subtitle">
            Prepare the participant before starting the experiment. Please ensure the participant
            is sitting comfortably at approximately 60–65 cm from the screen.
          </p>

          <div className="tobii-hardware-badge">
            <span
              className={`tobii-dot-indicator ${
                isConnected ? "tobii-dot-online" : "tobii-dot-offline"
              }`}
            />
            <span>
              {isConnected
                ? `${trackerStatus?.model || "Tobii Pro Fusion"} (${
                    trackerStatus?.sampling_frequency_hz || 120
                  } Hz) ${trackerStatus?.is_mock ? "[Simulation Mode]" : "[Hardware Ready]"}`
                : "Connecting to Python Tobii Driver on ws://localhost:8765..."}
            </span>
          </div>

          {errorMsg && <div className="tobii-failure-alert">{errorMsg}</div>}

          <div className="tobii-actions">
            <button
              className="tobii-btn tobii-btn-primary"
              disabled={!isConnected}
              onClick={handleStartSequence}
            >
              Start Calibration & Validation
            </button>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* In-Between Processing Screen                                      */}
      {/* ----------------------------------------------------------------- */}
      {flowState === "EVALUATING" && (
        <div className="tobii-card">
          <h2 className="tobii-title">Analyzing Gaze Accuracy...</h2>
          <p className="tobii-subtitle">
            Computing visual angle error, sample-to-sample RMS precision, and data completeness at
            120 Hz.
          </p>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Results & Recalibration Screen                                    */}
      {/* ----------------------------------------------------------------- */}
      {flowState === "FINISHED" && validationResult && (
        <div className="tobii-card">
          <h2 className="tobii-title">
            {validationResult.passed ? "Calibration Accepted" : "Calibration Inadequate"}
          </h2>
          <p className="tobii-subtitle">
            {validationResult.passed
              ? "All quality criteria met. Gaze tracking precision is validated for experimental tasks."
              : "Eye tracking quality did not satisfy experiment standards. Please adjust participant posture and recalibrate."}
          </p>

          {/* Validation Metrics Grid */}
          <div className="tobii-metrics-grid">
            {/* Metric 1: Data Loss */}
            <div
              className={`tobii-metric-box ${
                validationResult.metrics.data_loss_pct <= thresholds.max_data_loss_pct
                  ? "pass"
                  : "fail"
              }`}
            >
              <div className="tobii-metric-label">Data Loss</div>
              <div className="tobii-metric-value">
                {validationResult.metrics.data_loss_pct}%
              </div>
              <div className="tobii-metric-threshold">
                Target: {thresholds.max_data_loss_pct}%
              </div>
              <span
                className={`tobii-badge ${
                  validationResult.metrics.data_loss_pct <= thresholds.max_data_loss_pct
                    ? "tobii-badge-pass"
                    : "tobii-badge-fail"
                }`}
              >
                {validationResult.metrics.data_loss_pct <= thresholds.max_data_loss_pct
                  ? "PASS"
                  : "EXCEEDED"}
              </span>
            </div>

            {/* Metric 2: Precision (RMS Noise) */}
            <div
              className={`tobii-metric-box ${
                validationResult.metrics.precision_deg <= thresholds.max_precision_deg
                  ? "pass"
                  : "fail"
              }`}
            >
              <div className="tobii-metric-label">Precision (RMS)</div>
              <div className="tobii-metric-value">
                {validationResult.metrics.precision_deg}°
              </div>
              <div className="tobii-metric-threshold">
                Target: &le; {thresholds.max_precision_deg}°
              </div>
              <span
                className={`tobii-badge ${
                  validationResult.metrics.precision_deg <= thresholds.max_precision_deg
                    ? "tobii-badge-pass"
                    : "tobii-badge-fail"
                }`}
              >
                {validationResult.metrics.precision_deg <= thresholds.max_precision_deg
                  ? "PASS"
                  : "EXCEEDED"}
              </span>
            </div>

            {/* Metric 3: Accuracy (Visual Angle Offset) */}
            <div
              className={`tobii-metric-box ${
                validationResult.metrics.accuracy_deg <= thresholds.max_accuracy_deg
                  ? "pass"
                  : "fail"
              }`}
            >
              <div className="tobii-metric-label">Accuracy (Offset)</div>
              <div className="tobii-metric-value">
                {validationResult.metrics.accuracy_deg}°
              </div>
              <div className="tobii-metric-threshold">
                Target: &le; {thresholds.max_accuracy_deg}°
              </div>
              <span
                className={`tobii-badge ${
                  validationResult.metrics.accuracy_deg <= thresholds.max_accuracy_deg
                    ? "tobii-badge-pass"
                    : "tobii-badge-fail"
                }`}
              >
                {validationResult.metrics.accuracy_deg <= thresholds.max_accuracy_deg
                  ? "PASS"
                  : "EXCEEDED"}
              </span>
            </div>
          </div>

          {/* Failure Reasons list if criteria failed */}
          {validationResult.failure_reasons?.length > 0 && (
            <div className="tobii-failure-alert">
              <div className="tobii-failure-title">Validation Deviations:</div>
              <ul className="tobii-failure-list">
                {validationResult.failure_reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Decision Buttons */}
          <div className="tobii-actions">
            {validationResult.recalibrate_required ? (
              <button
                className="tobii-btn tobii-btn-recalibrate"
                onClick={handleRecalibrate}
              >
                &#x21bb; Recalibrate Eye Tracker
              </button>
            ) : (
              <>
                <button
                  className="tobii-btn tobii-btn-recalibrate"
                  style={{ backgroundColor: "#475569" }}
                  onClick={handleRecalibrate}
                >
                  Recalibrate Again
                </button>
                <button
                  className="tobii-btn tobii-btn-proceed"
                  onClick={() => onValidationSuccess(validationResult)}
                >
                  Proceed to Experiment &rarr;
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
