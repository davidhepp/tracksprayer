import asyncio
import os
import signal
from collections import deque
from pathlib import Path
from typing import Any, ClassVar, Literal

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState


LogLevel = Literal["stdout", "stderr"]
ProcessState = Literal["already_running", "started", "stopping", "not_running"]
Message = dict[str, Any]


class ProcessManager:
    _instance: ClassVar["ProcessManager | None"] = None

    def __new__(cls) -> "ProcessManager":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialized", False):
            return

        self._process: asyncio.subprocess.Process | None = None
        self._clients: set[WebSocket] = set()
        self._log_buffer: deque[Message] = deque(maxlen=200)
        self._lock = asyncio.Lock()
        self._reader_tasks: set[asyncio.Task[None]] = set()
        self._watch_task: asyncio.Task[None] | None = None
        self._script_path = Path(__file__).resolve().parent / "scripts" / "demo_process.sh"
        self._shutdown_timeout_seconds = 5.0
        self._initialized = True

    def status(self) -> dict[str, bool | int]:
        process = self._process
        if process is not None and process.returncode is None:
            return {"running": True, "pid": process.pid}
        return {"running": False}

    async def start(self) -> ProcessState:
        async with self._lock:
            if self._is_running():
                return "already_running"

            if not self._script_path.exists():
                raise FileNotFoundError(f"Process script not found: {self._script_path}")

            self._process = await asyncio.create_subprocess_exec(
                str(self._script_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                preexec_fn=os.setsid,
            )

            reader_tasks = {
                asyncio.create_task(self._stream_output(self._process.stdout, "stdout")),
                asyncio.create_task(self._stream_output(self._process.stderr, "stderr")),
            }
            self._reader_tasks = reader_tasks
            self._watch_task = asyncio.create_task(
                self._watch_process(self._process, reader_tasks)
            )

        await self._broadcast({"type": "status", "status": "running"})
        return "started"

    async def stop(self) -> ProcessState:
        async with self._lock:
            process = self._process
            if process is None or process.returncode is not None:
                return "not_running"

            await self._broadcast({"type": "status", "status": "stopping"})
            self._terminate_process_group(process)

        try:
            await asyncio.wait_for(process.wait(), timeout=self._shutdown_timeout_seconds)
        except asyncio.TimeoutError:
            self._kill_process_group(process)
            await process.wait()

        return "stopping"

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

        try:
            await websocket.send_json(self._current_status_message())
            for message in list(self._log_buffer):
                await websocket.send_json(message)

            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            self._clients.discard(websocket)

    def _is_running(self) -> bool:
        return self._process is not None and self._process.returncode is None

    def _current_status_message(self) -> Message:
        process = self._process
        if process is not None and process.returncode is None:
            return {"type": "status", "status": "running", "pid": process.pid}
        return {"type": "status", "status": "stopped"}

    async def _stream_output(
        self,
        stream: asyncio.StreamReader | None,
        level: LogLevel,
    ) -> None:
        if stream is None:
            return

        while True:
            line = await stream.readline()
            if not line:
                break

            message = {
                "type": "log",
                "level": level,
                "message": line.decode(errors="replace").rstrip("\r\n"),
            }
            self._log_buffer.append(message)
            await self._broadcast(message)

    async def _watch_process(
        self,
        process: asyncio.subprocess.Process,
        reader_tasks: set[asyncio.Task[None]],
    ) -> None:
        exit_code = await process.wait()

        if reader_tasks:
            await asyncio.gather(*reader_tasks, return_exceptions=True)

        async with self._lock:
            if self._process is process:
                self._process = None
                self._reader_tasks = set()
                self._watch_task = None

        await self._broadcast(
            {"type": "status", "status": "stopped", "exit_code": exit_code}
        )

    async def _broadcast(self, message: Message) -> None:
        if not self._clients:
            return

        disconnected: set[WebSocket] = set()
        for websocket in set(self._clients):
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
                else:
                    disconnected.add(websocket)
            except Exception:
                disconnected.add(websocket)

        self._clients.difference_update(disconnected)

    def _terminate_process_group(self, process: asyncio.subprocess.Process) -> None:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
        except ProcessLookupError:
            pass

    def _kill_process_group(self, process: asyncio.subprocess.Process) -> None:
        try:
            os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass


process_manager = ProcessManager()
