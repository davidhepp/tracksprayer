from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from process_manager import process_manager


app = FastAPI(title="TrackSprayer Process Backend")

# TODO: Configure production frontend origins from deployment-specific settings.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/process/start")
async def start_process() -> dict[str, bool | str]:
    try:
        status = await process_manager.start()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True, "status": status}


@app.post("/process/stop")
async def stop_process() -> dict[str, bool | str]:
    status = await process_manager.stop()
    return {"ok": True, "status": status}


@app.get("/process/status")
async def process_status() -> dict[str, bool | int]:
    return process_manager.status()


@app.websocket("/ws/process")
async def process_websocket(websocket: WebSocket) -> None:
    await process_manager.connect(websocket)

