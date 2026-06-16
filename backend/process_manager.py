import asyncio
import os
import signal
from collections import deque
from typing import Any, ClassVar, Literal

from fastapi import WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from settings import (
    OBSTACLES_FILE,
    PROCESS_DEFINITIONS,
    SHARED_FILES_DIR,
    WAYPOINTS_FILE,
    ProcessDefinition,
)

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

        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._clients: set[WebSocket] = set()
        self._log_buffer: deque[Message] = deque(maxlen=200)
        self._lock = asyncio.Lock()
        self._reader_tasks: dict[str, set[asyncio.Task[None]]] = {}
        self._watch_tasks: dict[str, asyncio.Task[None]] = {}
        self._shutdown_timeout_seconds = 5.0
        self._initialized = True

    def status(self) -> dict[str, dict[str, bool | int]]:
        return {
            name: self._process_status(name)
            for name in PROCESS_DEFINITIONS
        }

    async def start(self, name: str) -> ProcessState:
        definition = self._definition(name)

        async with self._lock:
            if self._is_running(name):
                return "already_running"

            if not definition.script_path.exists():
                raise FileNotFoundError(
                    f"Process script not found: {definition.script_path}"
                )
            if not definition.working_directory.exists():
                raise FileNotFoundError(
                    f"Process working directory not found: {definition.working_directory}"
                )

            process = await asyncio.create_subprocess_exec(
                str(definition.script_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(definition.working_directory),
                env={
                    **os.environ,
                    "TRACKSPRAYER_PROCESS_NAME": name,
                    "TRACKSPRAYER_SHARED_DIR": str(SHARED_FILES_DIR),
                    "TRACKSPRAYER_WAYPOINTS_FILE": str(WAYPOINTS_FILE),
                    "TRACKSPRAYER_OBSTACLES_FILE": str(OBSTACLES_FILE),
                    "PYTHONUNBUFFERED": "1",
                },
                preexec_fn=os.setsid,
            )

            self._processes[name] = process
            reader_tasks = {
                asyncio.create_task(
                    self._stream_output(name, process.stdout, "stdout")
                ),
                asyncio.create_task(
                    self._stream_output(name, process.stderr, "stderr")
                ),
            }
            self._reader_tasks[name] = reader_tasks
            self._watch_tasks[name] = asyncio.create_task(
                self._watch_process(name, process, reader_tasks)
            )

        await self._broadcast(
            {
                "type": "process_status",
                "process": name,
                "status": "running",
                "pid": process.pid,
            }
        )
        return "started"

    async def stop(self, name: str) -> ProcessState:
        async with self._lock:
            process = self._processes.get(name)
            if process is None or process.returncode is not None:
                return "not_running"

            await self._broadcast(
                {
                    "type": "process_status",
                    "process": name,
                    "status": "stopping",
                    "pid": process.pid,
                }
            )
            self._terminate_process_group(process)

        try:
            await asyncio.wait_for(process.wait(), timeout=self._shutdown_timeout_seconds)
        except asyncio.TimeoutError:
            self._kill_process_group(process)
            await process.wait()

        return "stopping"

    async def stop_all(self) -> None:
        for name in PROCESS_DEFINITIONS:
            await self.stop(name)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

        try:
            for message in self._current_status_messages():
                await websocket.send_json(message)
            for message in list(self._log_buffer):
                await websocket.send_json(message)

            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            self._clients.discard(websocket)

    def _definition(self, name: str) -> ProcessDefinition:
        try:
            return PROCESS_DEFINITIONS[name]
        except KeyError as exc:
            known = ", ".join(PROCESS_DEFINITIONS)
            raise ValueError(f"Unknown process '{name}'. Expected one of: {known}") from exc

    def _process_status(self, name: str) -> dict[str, bool | int]:
        process = self._processes.get(name)
        if process is not None and process.returncode is None:
            return {"running": True, "pid": process.pid}
        return {"running": False}

    def _is_running(self, name: str) -> bool:
        process = self._processes.get(name)
        return process is not None and process.returncode is None

    def _current_status_messages(self) -> list[Message]:
        messages: list[Message] = []
        for name in PROCESS_DEFINITIONS:
            process = self._processes.get(name)
            if process is not None and process.returncode is None:
                messages.append(
                    {
                        "type": "process_status",
                        "process": name,
                        "status": "running",
                        "pid": process.pid,
                    }
                )
            else:
                messages.append(
                    {
                        "type": "process_status",
                        "process": name,
                        "status": "stopped",
                    }
                )
        return messages

    async def _stream_output(
        self,
        name: str,
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
                "process": name,
                "level": level,
                "message": line.decode(errors="replace").rstrip("\r\n"),
            }
            self._log_buffer.append(message)
            await self._broadcast(message)

    async def _watch_process(
        self,
        name: str,
        process: asyncio.subprocess.Process,
        reader_tasks: set[asyncio.Task[None]],
    ) -> None:
        exit_code = await process.wait()

        if reader_tasks:
            await asyncio.gather(*reader_tasks, return_exceptions=True)

        async with self._lock:
            if self._processes.get(name) is process:
                self._processes.pop(name, None)
                self._reader_tasks.pop(name, None)
                self._watch_tasks.pop(name, None)

        await self._broadcast(
            {
                "type": "process_status",
                "process": name,
                "status": "stopped",
                "exit_code": exit_code,
            }
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
