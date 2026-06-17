import type { Cone, ConeType } from "./missionTypes";
import type { Discipline, Track, TrackGeometry } from "./tracksApi";

/**
 * Maps the backend cone groups (side based) to the frontend cone colours.
 * cones_left -> blue, cones_right -> yellow, cones_orange -> orange,
 * cones_orange_big -> orange_big.
 */
const GROUP_TO_CONE_TYPE = {
  cones_left: "blue",
  cones_right: "yellow",
  cones_orange: "orange",
  cones_orange_big: "orange_big",
} as const satisfies Record<string, ConeType>;

type ConeGroup = keyof typeof GROUP_TO_CONE_TYPE;

const CONE_GROUPS = Object.keys(GROUP_TO_CONE_TYPE) as ConeGroup[];

export type TrackDimensions = {
  width: number;
  height: number;
};

/**
 * A backend track converted into the meter-space shape the main-page placement
 * pipeline (`buildConeWaypoints`) consumes. Cones are re-centered on their
 * bounding-box center so the placement pivot (rotation around {0,0} + GPS
 * offset by `track.center`) keeps the track centered under the map marker,
 * exactly like the old hardcoded skidpad did.
 */
export type PreparedTrack = {
  id: string;
  name: string;
  discipline: Discipline;
  /** Cones in meters, recentered on the bounding-box center (origin). */
  cones: Cone[];
  /** True cone bounding box in meters (used for ROS payload dimensions). */
  dimensions: TrackDimensions;
  /** Padded bounding box used to size/rotate the draggable map overlay. */
  displayDimensions: TrackDimensions;
};

function collectRawCones(
  geometry: TrackGeometry,
): Array<{ type: ConeType; x: number; y: number }> {
  const raw: Array<{ type: ConeType; x: number; y: number }> = [];

  for (const group of CONE_GROUPS) {
    const type = GROUP_TO_CONE_TYPE[group];
    const points = geometry[group];
    if (!Array.isArray(points)) {
      continue;
    }
    for (const pair of points) {
      const x = pair?.[0];
      const y = pair?.[1];
      if (
        typeof x === "number" &&
        typeof y === "number" &&
        Number.isFinite(x) &&
        Number.isFinite(y)
      ) {
        raw.push({ type, x, y });
      }
    }
  }

  return raw;
}

export function prepareTrack(track: Track): PreparedTrack {
  const raw = collectRawCones(track);

  if (raw.length === 0) {
    return {
      id: track.id,
      name: track.name,
      discipline: track.discipline,
      cones: [],
      dimensions: { width: 0, height: 0 },
      displayDimensions: { width: 0, height: 0 },
    };
  }

  const xs = raw.map((cone) => cone.x);
  const ys = raw.map((cone) => cone.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = maxX - minX;
  const height = maxY - minY;

  const counts: Record<ConeType, number> = {
    blue: 0,
    yellow: 0,
    orange: 0,
    orange_big: 0,
  };

  const cones: Cone[] = raw.map((cone) => {
    const index = counts[cone.type];
    counts[cone.type] += 1;
    const id = `${cone.type}-${index}`;

    return {
      id,
      name: id,
      type: cone.type,
      color: cone.type,
      point: {
        x: cone.x - centerX,
        y: cone.y - centerY,
      },
    };
  });

  const pad = Math.max(2, 0.1 * Math.max(width, height));

  return {
    id: track.id,
    name: track.name,
    discipline: track.discipline,
    cones,
    dimensions: { width, height },
    displayDimensions: {
      width: width + pad * 2,
      height: height + pad * 2,
    },
  };
}
