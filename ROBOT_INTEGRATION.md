# Robot Integration

This repository contains the frontend and the FastAPI control backend. The ROS
packages and deploy scripts live in a different repository, so integration is
done by replacing paths and rosbridge settings through environment variables.

## Development mock flow

From the repo root:

```bash
./run-dev-stack.sh
```

The script creates `backend/.venv`, installs `backend/requirements.txt`, starts
FastAPI on port `8000`, and starts the frontend dev server.

The UI is locked until localization starts. The right-side workflow panel then
runs:

1. Start mocked localization.
2. Confirm READY. In mock mode this simulates a robot READY message received over rosbridge.
3. Check spray can or choose to drive anyway, then write mission JSON.
4. Align the robot manually, then start mocked navigation.

## Raspberry Pi configuration

Set these before starting the backend on the Pi:

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

If the ROS repository reads JSON from
`/home/ubuntu/trackSprayRobot/shared_files/waypoints.json` and
`obstacles.json` instead, set `TRACKSPRAYER_WAYPOINTS_FILE` and
`TRACKSPRAYER_OBSTACLES_FILE` to those exact paths.

## Rosbridge requirement

The backend talks to rosbridge using the standard rosbridge WebSocket protocol.
The Python client dependency is installed from `backend/requirements.txt`
(`websockets`).

The robot must run rosbridge on port `9090`, for example with
`rosbridge_suite`:

```bash
sudo apt install ros-noetic-rosbridge-server
roslaunch rosbridge_server rosbridge_websocket.launch
```

In production this should usually be a systemd service, as with the existing
`deploy/rosbridge.service`.

## READY topic

When the user clicks READY, the backend subscribes to the READY topic and waits
for the robot to publish:

```json
{
  "op": "subscribe",
  "topic": "/robot_ready",
  "type": "std_msgs/Bool"
}
```

The robot should then publish through rosbridge:

```json
{
  "op": "publish",
  "topic": "/robot_ready",
  "msg": {
    "data": true
  }
}
```

If the ROS repository expects a different READY topic or message type, change
`TRACKSPRAYER_READY_TOPIC` and `TRACKSPRAYER_READY_TYPE`. If no
`TRACKSPRAYER_ROSBRIDGE_URL` is configured, the backend mock waits briefly and
returns the same `ready_received` status as the real rosbridge path.

## Files written before navigation

The frontend sends waypoints and obstacles to:

```text
POST /mission/files
```

The backend writes:

```text
$TRACKSPRAYER_WAYPOINTS_FILE
$TRACKSPRAYER_OBSTACLES_FILE
```

Navigation should only be started after these files exist, because
`start_navigation.sh` reads them through the ROS nodes.
