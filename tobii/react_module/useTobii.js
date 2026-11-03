import { useState, useEffect, useRef, useCallback } from "react";

export const DEFAULT_POINTS = [
  { id: "center", x: 0.5, y: 0.5 },
  { id: "top-left", x: 0.15, y: 0.15 },
  { id: "top-right", x: 0.85, y: 0.15 },
  { id: "bottom-left", x: 0.15, y: 0.85 },
  { id: "bottom-right", x: 0.85, y: 0.85 },
];

export function useTobii({
  wsUrl = "ws://localhost:8765/ws/tobii",
  autoConnect = true,
  onGazeSample = null,
} = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [trackerStatus, setTrackerStatus] = useState(null);
  const [trackStatus, setTrackStatus] = useState({
    has_eyes: false,
    distance_cm: 0.0,
    distance_status: "NO_EYES",
    left_eye: null,
    right_eye: null,
  });
  const [flowState, setFlowState] = useState("POSITIONING"); // POSITIONING | CALIBRATING | VALIDATING | FINISHED
  const [currentPointIndex, setCurrentPointIndex] = useState(-1);
  const [validationResult, setValidationResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // High-precision calibrated gaze state (for live cognitive psychology experiment trials)
  const [liveGaze, setLiveGaze] = useState({
    x: 0.5,
    y: 0.5,
    raw_x: 0.5,
    raw_y: 0.5,
    valid: false,
    timestamp: 0,
    left_pupil_mm: null,
    right_pupil_mm: null,
    distance_cm: 0.0,
  });
  const [isGazeStreaming, setIsGazeStreaming] = useState(false);

  const socketRef = useRef(null);
  const onGazeSampleRef = useRef(onGazeSample);
  useEffect(() => {
    onGazeSampleRef.current = onGazeSample;
  }, [onGazeSample]);

  const send = useCallback((action, payload = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ action, payload }));
    }
  }, []);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setErrorMsg(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "STATUS") {
            setTrackerStatus(data.payload);
          } else if (data.type === "TRACK_STATUS") {
            setTrackStatus(data.payload);
          } else if (data.type === "GAZE_DATA") {
            setLiveGaze(data.payload);
            if (onGazeSampleRef.current) {
              onGazeSampleRef.current(data.payload);
            }
          } else if (data.type === "GAZE_STREAM_STARTED") {
            setIsGazeStreaming(true);
          } else if (data.type === "GAZE_STREAM_STOPPED") {
            setIsGazeStreaming(false);
          } else if (data.type === "VALIDATION_EVALUATION") {
            setValidationResult(data.payload);
            setFlowState("FINISHED");
          }
        } catch (err) {
          console.error("Error parsing message:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setErrorMsg("Failed to connect to Python Tobii service on localhost:8765");
      };

      ws.onclose = () => {
        setIsConnected(false);
        setTrackerStatus(null);
      };
    } catch (e) {
      setErrorMsg(e.message);
    }
  }, [wsUrl]);

  useEffect(() => {
    if (autoConnect) connect();
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [autoConnect, connect]);

  const startCalibrationFlow = useCallback(
    async (points = DEFAULT_POINTS) => {
      setErrorMsg(null);
      setValidationResult(null);
      setFlowState("CALIBRATING");
      send("START_CALIBRATION");

      for (let i = 0; i < points.length; i++) {
        setCurrentPointIndex(i);
        const pt = points[i];
        // Allow participant's gaze to settle on the contracting dot
        await new Promise((r) => setTimeout(r, 1000));
        send("COLLECT_CALIBRATION_POINT", { x: pt.x, y: pt.y });
        await new Promise((r) => setTimeout(r, 400));
      }

      setCurrentPointIndex(-1);
      send("COMPUTE_CALIBRATION");
    },
    [send]
  );

  const startValidationFlow = useCallback(
    async (
      points = DEFAULT_POINTS,
      thresholds = { max_data_loss_pct: 0.0, max_precision_deg: 0.2, max_accuracy_deg: 0.5 }
    ) => {
      setErrorMsg(null);
      setFlowState("VALIDATING");
      send("RESET_VALIDATION");
      await new Promise((r) => setTimeout(r, 200));

      for (let i = 0; i < points.length; i++) {
        setCurrentPointIndex(i);
        const pt = points[i];

        send("START_VALIDATION_POINT", { x: pt.x, y: pt.y });
        await new Promise((r) => setTimeout(r, 1300));
        send("STOP_VALIDATION_POINT", { x: pt.x, y: pt.y });
        await new Promise((r) => setTimeout(r, 150));
      }

      setCurrentPointIndex(-1);
      send("EVALUATE_VALIDATION", thresholds);
    },
    [send]
  );

  const returnToPositioning = useCallback(() => {
    setFlowState("POSITIONING");
    setValidationResult(null);
  }, []);

  const startGazeStream = useCallback(() => {
    send("START_GAZE_STREAM");
  }, [send]);

  const stopGazeStream = useCallback(() => {
    send("STOP_GAZE_STREAM");
  }, [send]);

  const logEvent = useCallback(
    (eventName, data = {}) => {
      send("LOG_EVENT", { event: eventName, data });
    },
    [send]
  );

  return {
    isConnected,
    trackerStatus,
    trackStatus,
    flowState,
    currentPointIndex,
    validationResult,
    errorMsg,
    liveGaze,
    isGazeStreaming,
    startCalibrationFlow,
    startValidationFlow,
    returnToPositioning,
    startGazeStream,
    stopGazeStream,
    logEvent,
    send,
  };
}
