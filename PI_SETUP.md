# Raspberry Pi Robot Setup

These instructions run the TrackSprayer frontend/backend against the real ROS
robot stack on the Raspberry Pi.

## Expected Directory Layout

Keep both repositories next to each other under the `ubuntu` user:

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

The robot deploy scripts use `$HOME/trackSprayRobot/robot`, so run the app as
the same user that owns the ROS workspace, normally `ubuntu`.

## Checkout Branches

```bash
cd /home/ubuntu/tracksprayer
git fetch origin
git switch david/integration || git switch -c david/integration --track origin/david/integration

cd /home/ubuntu/trackSprayRobot
git fetch origin
git switch david/integration || git switch -c david/integration --track origin/david/integration
```

## Backend Environment

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

Replace `<PI_IP>` with the Raspberry Pi IP address.

For local development, omit `.env` or use:

```bash
TRACKSPRAYER_MODE=dev
```

`dev` mode keeps the robot processes and READY check mocked.

## Frontend Environment

If the browser opens the frontend from another computer on the network, create
`/home/ubuntu/tracksprayer/frontend/.env`:

```bash
VITE_ROBOT_BACKEND_URL=http://<PI_IP>:8000
```

Replace `<PI_IP>` with the Raspberry Pi IP address.

If you open the frontend directly on the Pi, this file is optional because the
frontend defaults to `http://localhost:8000`.

## One-Time ROS Setup

```bash
cd /home/ubuntu/trackSprayRobot/robot
catkin_make

chmod +x /home/ubuntu/trackSprayRobot/deploy/scripts/start_localization.sh
chmod +x /home/ubuntu/trackSprayRobot/deploy/scripts/start_navigation.sh
chmod +x /home/ubuntu/trackSprayRobot/deploy/start_rosbridge.sh
mkdir -p /home/ubuntu/trackSprayRobot/shared_files
```

Install and start the rosbridge service:

```bash
sudo cp /home/ubuntu/trackSprayRobot/deploy/rosbridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rosbridge
systemctl status rosbridge
```

`start_navigation.sh` starts `pigpiod` with `sudo`. If it prompts for a password,
add this sudoers rule for the `ubuntu` user:

```text
ubuntu ALL=(ALL) NOPASSWD: /usr/bin/pigpiod
```

## One-Time App Setup

The frontend requires Node `20.19+` or `22.12+` and npm `10+`. The vague npm
error `Cannot read properties of undefined (reading '@react-router/node')`
usually means the Pi is using an old Node/npm from `apt`.

Check the installed versions:

```bash
node -v
npm -v
```

If Node is older than `20.19` or npm is older than `10`, install Node 22:

```bash
sudo apt remove -y nodejs npm
sudo apt update
sudo apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs

node -v
npm -v
```

Install frontend dependencies:

```bash
cd /home/ubuntu/tracksprayer/frontend
rm -rf node_modules
npm ci
```

The backend virtual environment is created automatically by `run-dev-stack.sh`.

## Run The App

```bash
cd /home/ubuntu/tracksprayer
./run-dev-stack.sh
```

Open the frontend:

```text
http://<PI_IP>:5173
```

## Robot Workflow

1. Click `Start localization`.
2. Click the READY action and wait for `/robot_status` with code `RTK_READY`.
3. Save mission files. The backend writes:
   - `/home/ubuntu/trackSprayRobot/shared_files/waypoints.json`
   - `/home/ubuntu/trackSprayRobot/shared_files/obstacles.json`
4. Click `Start navigation`.

The backend passes the mission file paths into the ROS process environment.
`trackSprayRobot/robot/src/navigation/launch/navigation.launch` forwards those
paths into `navigation.py` and `obstacle_avoidance_node.py`.

## Useful Checks

Check rosbridge:

```bash
systemctl status rosbridge
ss -tlnp | grep 9090
```

Check generated mission files:

```bash
ls -l /home/ubuntu/trackSprayRobot/shared_files/
cat /home/ubuntu/trackSprayRobot/shared_files/waypoints.json
cat /home/ubuntu/trackSprayRobot/shared_files/obstacles.json
```
