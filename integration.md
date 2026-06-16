# TrackSprayer Robot Integration

This app supports two backend modes:

- `TRACKSPRAYER_MODE=dev`: uses mock shell scripts and mock READY handling.
- `TRACKSPRAYER_MODE=real`: starts the ROS deploy scripts from `trackSprayRobot`
  and waits for `RTK_READY` over rosbridge.

## Expected Raspberry Pi layout

Keep both folders next to each other in the `ubuntu` home directory:

```text
/home/ubuntu/
  tracksprayer/
    backend/
    frontend/
  trackSprayRobot/
    deploy/scripts/start_localization.sh
    deploy/scripts/start_navigation.sh
    robot/
    shared_files/
```

The deploy scripts use `$HOME/trackSprayRobot/robot`, so run the backend as the
same user that owns the robot workspace, normally `ubuntu`.

## Backend `.env`

Create `/home/ubuntu/tracksprayer/.env`:

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

For local development, either omit `.env` or use:

```bash
TRACKSPRAYER_MODE=dev
```

## One-time Pi setup

```bash
cd /home/ubuntu/trackSprayRobot/robot
catkin_make

chmod +x /home/ubuntu/trackSprayRobot/deploy/scripts/start_localization.sh
chmod +x /home/ubuntu/trackSprayRobot/deploy/scripts/start_navigation.sh
chmod +x /home/ubuntu/trackSprayRobot/deploy/start_rosbridge.sh
mkdir -p /home/ubuntu/trackSprayRobot/shared_files

sudo cp /home/ubuntu/trackSprayRobot/deploy/rosbridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rosbridge
```

`start_navigation.sh` starts `pigpiod` with `sudo`. If it prompts for a password,
add a sudoers rule for the robot user:

```text
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/pigpiod
```

## Running the app on the Pi

```bash
cd /home/ubuntu/tracksprayer
./run-dev-stack.sh
```

Open the frontend at `http://<PI_IP>:5173`. The workflow is:

1. Start localization.
2. Wait for READY. In real mode this waits for `/robot_status` code `RTK_READY`.
3. Save mission files. The backend writes the JSON files under
   `/home/ubuntu/trackSprayRobot/shared_files/`.
4. Start navigation.

The backend passes the mission file paths into the ROS process environment.
`robot/src/navigation/launch/navigation.launch` forwards those paths into
`navigation.py` and `obstacle_avoidance_node.py`.
