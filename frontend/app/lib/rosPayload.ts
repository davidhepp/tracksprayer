import {
  type ConeWaypoint,
  type ObstacleBox,
  type RosPayload,
  type TrackPlacement,
} from "./missionTypes";
import type { TrackDimensions } from "./trackAdapter";
import { roundGps, roundMeasurement } from "./trackGeometry";

export type RosTrackInfo = {
  id: string;
  name: string;
  discipline: string;
  /** True cone bounding box of the selected track, in meters. */
  dimensions: TrackDimensions;
};

export function buildRosPayload(
  track: TrackPlacement,
  waypoints: ConeWaypoint[],
  obstacles: ObstacleBox[],
  trackInfo: RosTrackInfo,
): RosPayload {
  return {
    generated_at: new Date().toISOString(),
    track: {
      id: trackInfo.id,
      name: trackInfo.name,
      discipline: trackInfo.discipline,
      center: {
        lat: roundGps(track.center.lat),
        lng: roundGps(track.center.lng),
      },
      rotation_degrees: track.rotation,
      scale: 1,
      dimensions_meters: {
        width: roundMeasurement(trackInfo.dimensions.width),
        height: roundMeasurement(trackInfo.dimensions.height),
      },
    },
    points_to_mark: waypoints.map((waypoint) => ({
      id: waypoint.id,
      color: waypoint.color,
      lat: roundGps(waypoint.coordinate.lat),
      lon: roundGps(waypoint.coordinate.lng),
    })),
    obstacle_map: obstacles.map((obstacle) => ({
      id: obstacle.id,
      lat_min: obstacle.lat_min,
      lon_min: obstacle.lon_min,
      lat_max: obstacle.lat_max,
      lon_max: obstacle.lon_max,
      corners: {
        northwest: {
          lat: obstacle.lat_max,
          lng: obstacle.lon_min,
        },
        northeast: {
          lat: obstacle.lat_max,
          lng: obstacle.lon_max,
        },
        southeast: {
          lat: obstacle.lat_min,
          lng: obstacle.lon_max,
        },
        southwest: {
          lat: obstacle.lat_min,
          lng: obstacle.lon_min,
        },
      },
    })),
    obstacle_boxes_ros: obstacles.map((obstacle) => ({
      lat_min: obstacle.lat_min,
      lon_min: obstacle.lon_min,
      lat_max: obstacle.lat_max,
      lon_max: obstacle.lon_max,
    })),
  };
}
