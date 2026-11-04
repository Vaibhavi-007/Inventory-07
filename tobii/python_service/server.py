"""
FastAPI WebSocket & REST Bridge Server for Tobii Pro Fusion.
Features:
- Real-time Track Status (Headbox 2D eye positions + participant distance in cm)
- Persistent 120Hz continuous gaze streaming (prevents hardware sleep)
- Tobii Pro Lab style calibration & validation flow
"""

import asyncio
import json
import logging
import os
import time
from typing import Dict, Any, List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tobii_controller import TobiiFusionController

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TobiiServer")

app = FastAPI(title="Tobii Pro Fusion Bridge Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global controller instance connected at startup
controller = TobiiFusionController()
controller.connect()


class ScreenConfig(BaseModel):
    screen_width_mm: float = 602.1
    screen_height_mm: float = 338.7
    distance_mm: float = 650.0
    offset_y_mm: float = 33.0


@app.get("/api/status")
async def get_status():
    status = controller.get_status()
    status["available_displays"] = controller.available_displays
    return status


@app.get("/api/displays")
async def get_displays():
    return {
        "displays": controller.available_displays,
        "selected": {
            "width_mm": controller.screen_width_mm,
            "height_mm": controller.screen_height_mm,
            "distance_mm": controller.distance_mm,
            "offset_y_mm": getattr(controller, "offset_y_mm", 33.0)
        }
    }


@app.get("/api/track-status")
async def get_track_status():
    return controller.get_track_status()


@app.post("/api/configure")
async def configure_screen(config: ScreenConfig):
    controller.screen_width_mm = config.screen_width_mm
    controller.screen_height_mm = config.screen_height_mm
    controller.distance_mm = config.distance_mm
    controller.offset_y_mm = config.offset_y_mm
    controller.apply_display_area(config.offset_y_mm)
    return {
        "success": True,
        "screen_geometry": {
            "width_mm": controller.screen_width_mm,
            "height_mm": controller.screen_height_mm,
            "distance_mm": controller.distance_mm,
            "offset_y_mm": controller.offset_y_mm
        }
    }


@app.get("/api/gaze")
async def get_latest_gaze():
    """Returns the latest 120Hz calibrated gaze coordinate and pupil metrics."""
    return controller.get_latest_gaze_sample()


@app.get("/api/gaze-model")
async def get_gaze_model():
    """Returns the active calibrated 2D polynomial model weights and screen geometry."""
    return controller.export_gaze_model()


@app.post("/api/gaze-model")
async def set_gaze_model(model_data: Dict[str, Any]):
    """Imports pre-calibrated model parameters from an external cognitive experiment session."""
    success = controller.import_gaze_model(model_data)
    return {"success": success, "active_model": controller.export_gaze_model()}


@app.get("/", response_class=HTMLResponse)
async def serve_calibration_ui():
    html_path = os.path.join(os.path.dirname(__file__), "calibration_ui.html")
    with open(html_path, "r", encoding="utf-8") as f:
        return f.read()


@app.websocket("/ws/tobii")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to Tobii WebSocket.")

    # Lock to prevent concurrent send collisions between 120Hz gaze, 30Hz track status, and RPC responses
    ws_lock = asyncio.Lock()

    async def safe_send_json(data: dict):
        async with ws_lock:
            try:
                await websocket.send_json(data)
            except Exception:
                pass

    # Send initial status
    await safe_send_json({
        "type": "STATUS",
        "payload": controller.get_status()
    })

    # Background task to stream Track Status (Headbox & distance) at ~30 FPS
    stop_stream_event = asyncio.Event()
    gaze_stream_active = False

    async def stream_track_status():
        while not stop_stream_event.is_set():
            try:
                status = controller.get_track_status()
                await safe_send_json({
                    "type": "TRACK_STATUS",
                    "payload": status
                })
                await asyncio.sleep(0.033)  # ~30 Hz broadcast
            except Exception:
                if stop_stream_event.is_set():
                    break
                await asyncio.sleep(0.05)

    async def stream_calibrated_gaze():
        # High-frequency 120Hz calibrated gaze streaming for cognitive experiment trials
        while not stop_stream_event.is_set():
            try:
                if gaze_stream_active:
                    gaze_sample = controller.get_latest_gaze_sample()
                    await safe_send_json({
                        "type": "GAZE_DATA",
                        "payload": gaze_sample
                    })
                await asyncio.sleep(0.008)  # ~120 Hz broadcast (~8.3 ms per frame)
            except Exception:
                if stop_stream_event.is_set():
                    break
                await asyncio.sleep(0.01)

    stream_task = asyncio.create_task(stream_track_status())
    gaze_task = asyncio.create_task(stream_calibrated_gaze())

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            action = data.get("action")
            payload = data.get("payload", {})

            if action == "START_GAZE_STREAM":
                gaze_stream_active = True
                await safe_send_json({"type": "GAZE_STREAM_STARTED", "sampling_rate_hz": 120})

            elif action == "STOP_GAZE_STREAM":
                gaze_stream_active = False
                await safe_send_json({"type": "GAZE_STREAM_STOPPED"})

            elif action == "LOG_EVENT":
                # Tag an experimental event (e.g. STIMULUS_ONSET, KEYPRESS, TRIAL_START)
                event_name = payload.get("event", "UNKNOWN")
                event_data = payload.get("data", {})
                logger.info(f"Experiment Event Logged: {event_name} | {event_data}")
                await safe_send_json({
                    "type": "EVENT_LOGGED",
                    "event": event_name,
                    "timestamp": time.time()
                })

            elif action == "RECONNECT":
                status = controller.connect()
                await safe_send_json({"type": "STATUS", "payload": status})

            elif action == "START_CALIBRATION":
                success = controller.start_calibration()
                await safe_send_json({
                    "type": "CALIBRATION_STARTED",
                    "success": success
                })

            elif action == "COLLECT_CALIBRATION_POINT":
                x = float(payload.get("x", 0.5))
                y = float(payload.get("y", 0.5))
                result = controller.collect_calibration_point(x, y)
                await safe_send_json({
                    "type": "CALIBRATION_POINT_COLLECTED",
                    "payload": result
                })

            elif action == "COMPUTE_CALIBRATION":
                result = controller.compute_and_finish_calibration()
                await safe_send_json({
                    "type": "CALIBRATION_RESULT",
                    "payload": result
                })

            elif action == "RESET_VALIDATION":
                controller.reset_validation()
                await safe_send_json({"type": "VALIDATION_RESET", "success": True})

            elif action == "START_VALIDATION_POINT":
                x = float(payload.get("x", 0.5))
                y = float(payload.get("y", 0.5))
                controller.mark_validation_point_start(x, y)
                await safe_send_json({
                    "type": "VALIDATION_RECORDING_STARTED",
                    "point": [x, y]
                })

            elif action == "STOP_VALIDATION_POINT":
                x = float(payload.get("x", 0.5))
                y = float(payload.get("y", 0.5))
                controller.mark_validation_point_stop(x, y)
                await safe_send_json({
                    "type": "VALIDATION_POINT_SAVED",
                    "point": [x, y]
                })

            elif action == "EVALUATE_VALIDATION":
                max_loss = float(payload.get("max_data_loss_pct", 0.0))
                max_prec = float(payload.get("max_precision_deg", 0.2))
                max_acc = float(payload.get("max_accuracy_deg", 0.5))

                evaluation = controller.evaluate_validation(
                    max_data_loss_pct=max_loss,
                    max_precision_deg=max_prec,
                    max_accuracy_deg=max_acc
                )

                logger.info(
                    f"Validation Result: Passed={evaluation['passed']} | "
                    f"Loss={evaluation['metrics']['data_loss_pct']}% | "
                    f"Acc={evaluation['metrics']['accuracy_deg']}° | "
                    f"Prec={evaluation['metrics']['precision_deg']}°"
                )

                await safe_send_json({
                    "type": "VALIDATION_EVALUATION",
                    "payload": evaluation
                })

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
    finally:
        stop_stream_event.set()
        stream_task.cancel()
        gaze_task.cancel()


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("  Starting Tobii Pro Fusion Bridge Service on ws://localhost:8765")
    print("=" * 60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8765)
