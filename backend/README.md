# TrackSprayer Backend

FastAPI service for starting, stopping, monitoring, and streaming logs from robot-related processes.

The current implementation runs `scripts/demo_process.sh`. The process command is centralized in `process_manager.py`, so replacing it later with deployment scripts such as `/deploy/scripts/start_localization.sh` or `/deploy/scripts/start_navigation.sh` should only require changing the configured process path and, if needed, adding process selection logic.

## Creating the virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running manually

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API examples

Start the process:

```text
POST http://<raspberry-pi-ip>:8000/process/start
```

Stop the process:

```text
POST http://<raspberry-pi-ip>:8000/process/stop
```

Get current status:

```text
GET http://<raspberry-pi-ip>:8000/process/status
```

Connect to process events:

```text
WS ws://<raspberry-pi-ip>:8000/ws/process
```

## Example frontend snippets

Start a process:

```ts
async function startProcess() {
  const response = await fetch("http://<raspberry-pi-ip>:8000/process/start", {
    method: "POST",
  });
  return response.json();
}
```

Stop a process:

```ts
async function stopProcess() {
  const response = await fetch("http://<raspberry-pi-ip>:8000/process/stop", {
    method: "POST",
  });
  return response.json();
}
```

Open a WebSocket and receive logs:

```ts
const socket = new WebSocket("ws://<raspberry-pi-ip>:8000/ws/process");

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "status") {
    console.log("process status:", message.status, message);
  }

  if (message.type === "log") {
    console.log(`[${message.level}] ${message.message}`);
  }
});

socket.addEventListener("close", () => {
  console.log("process WebSocket closed");
});
```

