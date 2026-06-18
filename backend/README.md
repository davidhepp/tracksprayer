# TrackSprayer Backend

FastAPI service for the frontend-controlled robot workflow:

1. Start localization.
2. Wait for robot READY through rosbridge.
3. Save waypoint and obstacle JSON files.
4. Start navigation.

The default scripts are mocks:

- `scripts/mock_start_localization.sh`
- `scripts/mock_start_navigation.sh`

Raspberry Pi deployment is documented in the root [PI_SETUP.md](../PI_SETUP.md).

## Creating the virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

The root `./run-dev-stack.sh` script does this automatically.

## Running manually

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API

```text
POST /process/localization/start
POST /process/navigation/start
POST /process/{localization|navigation}/stop
GET  /process/status
POST /robot/ready
GET  /robot/gps/fix
POST /mission/files
WS   /ws/process
```

`/robot/ready` is mocked when `TRACKSPRAYER_MODE=dev`. In real mode it
subscribes through rosbridge and waits for one of `TRACKSPRAYER_READY_VALUES`
on `TRACKSPRAYER_READY_TOPIC`. The default is `/gps/quality` with values `4`
or `5`.

`/robot/gps/fix` subscribes through rosbridge to `/gps/fix` by default and
returns one `sensor_msgs/NavSatFix` sample for recentering the frontend map.
