import asyncio
import json
import platform
import subprocess
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from process_manager import process_manager
from settings import (
    CORS_ORIGINS,
    OBSTACLES_FILE,
    ROSBRIDGE_READY_CODE,
    ROSBRIDGE_READY_SOURCE,
    ROSBRIDGE_READY_TOPIC,
    ROSBRIDGE_READY_TIMEOUT_SECONDS,
    ROSBRIDGE_READY_TYPE,
    ROSBRIDGE_URL,
    WAYPOINTS_FILE,
)


app = FastAPI(title="TrackSprayer Process Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MissionFilesRequest(BaseModel):
    waypoints: list[dict]
    obstacles: list[dict]


class MissionFileRevealRequest(BaseModel):
    kind: Literal["waypoints", "obstacles"]


async def _start_process(name: str) -> dict[str, bool | str]:
    try:
        status = await process_manager.start(name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Process script is not executable: {exc.filename}",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {"ok": True, "status": status}


@app.post("/process/localization/start")
async def start_localization() -> dict[str, bool | str]:
    return await _start_process("localization")


@app.post("/process/navigation/start")
async def start_navigation() -> dict[str, bool | str]:
    return await _start_process("navigation")


@app.post("/process/{name}/start")
async def start_named_process(name: str) -> dict[str, bool | str]:
    return await _start_process(name)


@app.post("/process/{name}/stop")
async def stop_process(name: str) -> dict[str, bool | str]:
    try:
        status = await process_manager.stop(name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {"ok": True, "status": status}


@app.get("/process/status")
async def process_status() -> dict[str, dict[str, bool | int]]:
    return process_manager.status()


@app.post("/mission/files")
async def save_mission_files(payload: MissionFilesRequest) -> dict[str, bool | str]:
    WAYPOINTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    OBSTACLES_FILE.parent.mkdir(parents=True, exist_ok=True)

    _write_json_atomic(WAYPOINTS_FILE, payload.waypoints)
    _write_json_atomic(OBSTACLES_FILE, payload.obstacles)

    return {
        "ok": True,
        "waypoints_file": str(WAYPOINTS_FILE),
        "obstacles_file": str(OBSTACLES_FILE),
    }


@app.post("/mission/files/reveal")
async def reveal_mission_file(payload: MissionFileRevealRequest) -> dict[str, bool | str]:
    path = WAYPOINTS_FILE if payload.kind == "waypoints" else OBSTACLES_FILE

    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Mission file not found: {path}")

    try:
        _reveal_path(path)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not reveal mission file: {exc}",
        ) from exc

    return {"ok": True, "path": str(path)}


@app.post("/robot/ready")
async def wait_for_robot_ready() -> dict[str, bool | str]:
    if not ROSBRIDGE_URL:
        await asyncio.sleep(0.35)
        return {
            "ok": True,
            "mode": "mock_rosbridge",
            "status": "ready_received",
            "source": "mock_robot",
            "topic": ROSBRIDGE_READY_TOPIC,
        }

    try:
        await asyncio.wait_for(
            _wait_for_robot_ready(),
            timeout=ROSBRIDGE_READY_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                f"Robot READY was not received on {ROSBRIDGE_READY_TOPIC} "
                f"within {ROSBRIDGE_READY_TIMEOUT_SECONDS:g}s."
            ),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"ROS bridge READY receive failed: {exc}",
        ) from exc

    return {
        "ok": True,
        "mode": "rosbridge",
        "status": "ready_received",
        "source": "robot",
        "topic": ROSBRIDGE_READY_TOPIC,
        "code": ROSBRIDGE_READY_CODE,
    }


async def _wait_for_robot_ready() -> None:
    import websockets

    subscribe_message = {
        "op": "subscribe",
        "topic": ROSBRIDGE_READY_TOPIC,
        "type": ROSBRIDGE_READY_TYPE,
    }

    async with websockets.connect(ROSBRIDGE_URL) as websocket:
        await websocket.send(json.dumps(subscribe_message))

        while True:
            raw_message = await websocket.recv()
            message = json.loads(raw_message)

            if _is_robot_ready_message(message):
                return


def _is_robot_ready_message(message: Any) -> bool:
    if not isinstance(message, dict):
        return False

    if message.get("op") != "publish" or message.get("topic") != ROSBRIDGE_READY_TOPIC:
        return False

    msg = message.get("msg")
    if not isinstance(msg, dict):
        return False

    if msg.get("data") is True:
        return True

    if ROSBRIDGE_READY_SOURCE and msg.get("source") != ROSBRIDGE_READY_SOURCE:
        return False

    return msg.get("code") == ROSBRIDGE_READY_CODE


def _write_json_atomic(path: Path, data: Any) -> None:
    temp_path = path.with_name(f".{path.name}.tmp")
    temp_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)


def _reveal_path(path: Path) -> None:
    system = platform.system()

    if system == "Darwin":
        subprocess.Popen(["open", "-R", str(path)])
        return

    if system == "Windows":
        subprocess.Popen(["explorer", f"/select,{path}"])
        return

    subprocess.Popen(["xdg-open", str(path.parent)])


@app.websocket("/ws/process")
async def process_websocket(websocket: WebSocket) -> None:
    await process_manager.connect(websocket)
