# TrackSprayer Backend

FastAPI service for the frontend-controlled robot workflow:

1. Start localization.
2. Wait for robot READY through rosbridge.
3. Save waypoint and obstacle JSON files.
4. Start navigation.

The default scripts are mocks:

- `scripts/mock_start_localization.sh`
- `scripts/mock_start_navigation.sh`

Replace paths through environment variables when deploying to the Raspberry Pi.

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
POST /mission/files
WS   /ws/process
```

`/robot/ready` is mocked when `TRACKSPRAYER_MODE=dev`. In real mode it
subscribes through rosbridge and waits for `TRACKSPRAYER_READY_CODE` on
`TRACKSPRAYER_READY_TOPIC`. The robot defaults publish `RTK_READY` as
`robot_msgs/RobotStatus` on `/robot_status`.

## Real robot configuration

Create `tracksprayer/.env` on the Raspberry Pi:

```bash
TRACKSPRAYER_MODE=real
TRACKSPRAYER_ROBOT_REPO_DIR=/home/ubuntu/trackSprayRobot
TRACKSPRAYER_SHARED_DIR=/home/ubuntu/trackSprayRobot/shared_files
TRACKSPRAYER_WAYPOINTS_FILE=/home/ubuntu/trackSprayRobot/shared_files/waypoints.json
TRACKSPRAYER_OBSTACLES_FILE=/home/ubuntu/trackSprayRobot/shared_files/obstacles.json
TRACKSPRAYER_ROSBRIDGE_URL=ws://localhost:9090
TRACKSPRAYER_READY_TOPIC=/robot_status
TRACKSPRAYER_READY_TYPE=robot_msgs/RobotStatus
TRACKSPRAYER_READY_CODE=RTK_READY
TRACKSPRAYER_READY_SOURCE=navigation
TRACKSPRAYER_READY_TIMEOUT_SECONDS=30
TRACKSPRAYER_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://<PI_IP>:5173
```

With `TRACKSPRAYER_MODE=real`, script and working-directory defaults are derived
from `TRACKSPRAYER_ROBOT_REPO_DIR`:

- `deploy/scripts/start_localization.sh`
- `deploy/scripts/start_navigation.sh`
- `robot/` as the process working directory

The backend writes mission JSON before starting navigation and passes the JSON
paths into the ROS process environment. `navigation.launch` forwards those paths
to the navigation and obstacle-avoidance nodes.

Rosbridge must be running on the robot, typically through `rosbridge_suite` on
port `9090`.

For local development, omit `.env` or set:

```bash
TRACKSPRAYER_MODE=dev
```

That keeps both robot processes and `/robot/ready` mocked.
