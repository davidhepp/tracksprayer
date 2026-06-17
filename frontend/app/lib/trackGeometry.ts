import type { GpsCoordinate, Point } from "./mapMath";
import {
  clamp,
  gpsToMapPoint,
  gpsToWorldPixel,
  mapPointToGps,
  metersPerPixel,
  offsetGpsByMeters,
  rotatePoint,
  worldPixelToGps,
} from "./mapMath";
import {
  DEFAULT_ZOOM,
  MAP_SIZE,
  MAX_OSM_TILE_ZOOM,
  MIN_ZOOM,
  OSM_TILE_URL,
  TILE_SIZE,
  ZOOM_STEP,
  type Cone,
  type ConeWaypoint,
  type MapRect,
  type MapTile,
  type ObstacleBox,
  type TrackPlacement,
} from "./missionTypes";

/**
 * Places meter-space cones onto the map at real-world size: rotate around the
 * track origin {0,0}, then offset by the GPS `track.center`. Cones are expected
 * to already be centered on the origin (see `prepareTrack`).
 */
export function buildConeWaypoints(
  cones: readonly Cone[],
  track: TrackPlacement,
  zoom: number,
): ConeWaypoint[] {
  return cones.map((cone) => {
    const rotatedPoint = rotatePoint(cone.point, { x: 0, y: 0 }, -track.rotation);

    return {
      id: cone.id,
      color: cone.color,
      coordinate: offsetGpsByMeters(
        track.center,
        { x: rotatedPoint.x, y: rotatedPoint.y },
        zoom,
      ),
    };
  });
}

/**
 * Fraction of the viewport the (padded) track may occupy when fitting. Leaves a
 * comfortable margin and stays below the `trackWarning` threshold (0.9).
 */
const FIT_PADDING_FRACTION = 0.85;

/**
 * Picks the map zoom so a real-size track bounding box (in meters) fits inside
 * the viewport with margin. The track is never scaled; only the zoom changes.
 *
 * meters-per-pixel = C / 2^zoom, so the zoom that yields the required
 * meters-per-pixel is log2(C / requiredMpp). We floor to the zoom grid (so the
 * track definitely fits) and clamp to [MIN_ZOOM, DEFAULT_ZOOM] — never auto
 * zooming past the default keeps small tracks (e.g. skidpad) looking unchanged.
 */
export function computeFitZoom(
  dimensionsMeters: { width: number; height: number },
  latitude: number,
  mapSize: Point = MAP_SIZE,
): number {
  const { width, height } = dimensionsMeters;

  if (width <= 0 || height <= 0) {
    return DEFAULT_ZOOM;
  }

  const requiredMetersPerPixel = Math.max(
    width / (mapSize.x * FIT_PADDING_FRACTION),
    height / (mapSize.y * FIT_PADDING_FRACTION),
  );
  const metersPerPixelAtZoomZero = metersPerPixel(latitude, 0);
  const fitZoom = Math.log2(
    metersPerPixelAtZoomZero / requiredMetersPerPixel,
  );
  const steppedZoom = Math.floor(fitZoom / ZOOM_STEP) * ZOOM_STEP;

  return clamp(steppedZoom, MIN_ZOOM, DEFAULT_ZOOM);
}

export function pointsToRect(startPoint: Point, endPoint: Point): MapRect {
  return {
    left: Math.min(startPoint.x, endPoint.x),
    top: Math.min(startPoint.y, endPoint.y),
    width: Math.abs(endPoint.x - startPoint.x),
    height: Math.abs(endPoint.y - startPoint.y),
  };
}

export function mapRectToObstacleBox(
  rect: MapRect,
  mapSize: Point,
  mapCenter: GpsCoordinate,
  zoom: number,
): ObstacleBox {
  const northwest = mapPointToGps(
    { x: rect.left, y: rect.top },
    mapSize,
    mapCenter,
    zoom,
  );
  const southeast = mapPointToGps(
    { x: rect.left + rect.width, y: rect.top + rect.height },
    mapSize,
    mapCenter,
    zoom,
  );

  return {
    id: `obstacle-${Date.now()}-${Math.round(rect.left)}-${Math.round(rect.top)}`,
    lat_min: roundGps(Math.min(northwest.lat, southeast.lat)),
    lon_min: roundGps(Math.min(northwest.lng, southeast.lng)),
    lat_max: roundGps(Math.max(northwest.lat, southeast.lat)),
    lon_max: roundGps(Math.max(northwest.lng, southeast.lng)),
  };
}

export function obstacleBoxToMapRect(
  obstacle: ObstacleBox,
  mapCenter: GpsCoordinate,
  zoom: number,
) {
  const northwest = gpsToMapPoint(
    { lat: obstacle.lat_max, lng: obstacle.lon_min },
    MAP_SIZE,
    mapCenter,
    zoom,
  );
  const southeast = gpsToMapPoint(
    { lat: obstacle.lat_min, lng: obstacle.lon_max },
    MAP_SIZE,
    mapCenter,
    zoom,
  );

  return pointsToRect(northwest, southeast);
}

export function buildMapTiles(
  center: GpsCoordinate,
  zoom: number,
  mapSize: Point,
): MapTile[] {
  const tileZoom = Math.min(Math.floor(zoom), MAX_OSM_TILE_ZOOM);
  const tileScale = 2 ** (zoom - tileZoom);
  const centerWorld = gpsToWorldPixel(center, zoom);
  const topLeft = {
    x: centerWorld.x - mapSize.x / 2,
    y: centerWorld.y - mapSize.y / 2,
  };
  const visibleTileSize = TILE_SIZE * tileScale;
  const firstX = Math.floor(topLeft.x / visibleTileSize);
  const lastX = Math.floor((topLeft.x + mapSize.x) / visibleTileSize);
  const firstY = Math.floor(topLeft.y / visibleTileSize);
  const lastY = Math.floor((topLeft.y + mapSize.y) / visibleTileSize);
  const tilesPerAxis = 2 ** tileZoom;
  const tiles: MapTile[] = [];

  for (let x = firstX; x <= lastX; x += 1) {
    for (let y = firstY; y <= lastY; y += 1) {
      if (y < 0 || y >= tilesPerAxis) {
        continue;
      }

      const wrappedX = ((x % tilesPerAxis) + tilesPerAxis) % tilesPerAxis;
      tiles.push({
        id: `${formatZoom(zoom)}-${tileZoom}-${wrappedX}-${y}`,
        url: `${OSM_TILE_URL}/${tileZoom}/${wrappedX}/${y}.png`,
        left: x * visibleTileSize - topLeft.x,
        top: y * visibleTileSize - topLeft.y,
        size: visibleTileSize,
      });
    }
  }

  return tiles;
}

export function zoomAroundAnchor({
  anchor,
  currentCenter,
  currentZoom,
  nextZoom,
  mapSize,
}: {
  anchor: Point;
  currentCenter: GpsCoordinate;
  currentZoom: number;
  nextZoom: number;
  mapSize: Point;
}) {
  const anchorGps = mapPointToGps(anchor, mapSize, currentCenter, currentZoom);
  const anchorWorldAtNextZoom = gpsToWorldPixel(anchorGps, nextZoom);

  return worldPixelToGps(
    {
      x: anchorWorldAtNextZoom.x + mapSize.x / 2 - anchor.x,
      y: anchorWorldAtNextZoom.y + mapSize.y / 2 - anchor.y,
    },
    nextZoom,
  );
}

export function formatZoom(zoom: number) {
  return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(1);
}

export function angleBetween(center: Point, point: Point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

export function normalizeRotation(rotation: number) {
  const normalized = ((rotation + 180) % 360) - 180;
  return Number(normalized.toFixed(1));
}

export function roundGps(value: number) {
  return Number(value.toFixed(7));
}

export function roundMeasurement(value: number) {
  return Number(value.toFixed(2));
}

export function formatAccuracy(accuracyMeters: number | null) {
  if (accuracyMeters === null) {
    return "accuracy unknown";
  }

  return `accuracy +/-${accuracyMeters} m`;
}
