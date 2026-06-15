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

`/robot/ready` uses mock mode unless `TRACKSPRAYER_ROSBRIDGE_URL` is set. In
real mode it subscribes to `TRACKSPRAYER_READY_TOPIC` and waits for the robot to
publish `std_msgs/Bool(data=true)`.

## Real robot configuration

```bash
export TRACKSPRAYER_LOCALIZATION_SCRIPT=/deploy/scripts/start_localization.sh
export TRACKSPRAYER_NAVIGATION_SCRIPT=/deploy/scripts/start_navigation.sh
export TRACKSPRAYER_LOCALIZATION_CWD=/home/ubuntu/trackSprayRobot/robot
export TRACKSPRAYER_NAVIGATION_CWD=/home/ubuntu/trackSprayRobot/robot
export TRACKSPRAYER_WAYPOINTS_FILE=/home/ubuntu/tracksprayer/waypoints.json
export TRACKSPRAYER_OBSTACLES_FILE=/home/ubuntu/tracksprayer/obstacles.json
export TRACKSPRAYER_ROSBRIDGE_URL=ws://<ROBOT_IP>:9090
export TRACKSPRAYER_READY_TOPIC=/robot_ready
export TRACKSPRAYER_READY_TYPE=std_msgs/Bool
export TRACKSPRAYER_READY_TIMEOUT_SECONDS=10
```

Adjust the JSON paths to the exact files read by the navigation nodes in the ROS
repository. The backend writes those files before starting navigation.

Rosbridge must be running on the robot, typically through `rosbridge_suite` on
port `9090`.
