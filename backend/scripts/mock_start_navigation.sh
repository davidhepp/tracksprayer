#!/bin/bash
set -e

SHARED_DIR="${TRACKSPRAYER_SHARED_DIR:-$(pwd)/shared_files}"
WAYPOINTS_FILE="${TRACKSPRAYER_WAYPOINTS_FILE:-$SHARED_DIR/waypoints.json}"
OBSTACLES_FILE="${TRACKSPRAYER_OBSTACLES_FILE:-$SHARED_DIR/obstacles.json}"

echo "========================================="
echo "   TrackSprayRobot - Phase 2: Navigation"
echo "========================================="
echo "--> MOCK: would source /opt/ros/noetic/setup.bash"
echo "--> MOCK: would cd to \$HOME/trackSprayRobot/robot"
echo "--> MOCK: would source devel/setup.bash"
echo "--> MOCK: would ensure pigpiod is running"

if [ ! -f "$WAYPOINTS_FILE" ]; then
  echo "[FEHLER] waypoints.json fehlt: $WAYPOINTS_FILE" >&2
  exit 1
fi

if [ ! -f "$OBSTACLES_FILE" ]; then
  echo "[FEHLER] obstacles.json fehlt: $OBSTACLES_FILE" >&2
  exit 1
fi

echo "--> MOCK: found waypoints file: $WAYPOINTS_FILE"
echo "--> MOCK: found obstacles file: $OBSTACLES_FILE"
echo "--> MOCK: would run roslaunch bringup navigation_only.launch"

for i in {1..10}
do
  echo "Navigation mock waypoint progress ($i/10)"
  sleep 2
done

echo "Navigation mock finished: GOAL_REACHED"
