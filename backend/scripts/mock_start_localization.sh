#!/bin/bash
set -e

echo "========================================="
echo "   TrackSprayRobot - Phase 1: Localization"
echo "========================================="
echo "--> MOCK: would source /opt/ros/noetic/setup.bash"
echo "--> MOCK: would cd to \$HOME/trackSprayRobot/robot"
echo "--> MOCK: would source devel/setup.bash"
echo "--> MOCK: would run roslaunch bringup localization_only.launch"
echo "[navigation] Mock GPS quality READY can now be confirmed from the frontend."

i=1
while true
do
  echo "Localization mock heartbeat ($i): gps_node + ntrip_client running"
  sleep 2
  i=$((i + 1))
done
