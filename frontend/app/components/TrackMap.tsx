import { useState, type PointerEvent, type RefObject } from "react";

import type { GpsCoordinate, Point } from "../lib/mapMath";
import { gpsToMapPoint } from "../lib/mapMath";
import {
  MAP_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  SKIDPAD,
  ZOOM_STEP,
  type DevicePosition,
  type DragState,
  type EditorMode,
  type MapRect,
  type MapTile,
  type TrackPlacement,
  type VisibleObstacleBox,
} from "../lib/missionTypes";
import { buildConePositionsMeters, formatZoom } from "../lib/trackGeometry";
import {
  EXPECTED_TOTAL_CONES,
  SKIDPAD_GUIDES,
  SKIDPAD_OVERLAY_TRANSFORM,
  worldToScreen,
  type SkidpadCone,
  type SkidpadOverlayTransform,
} from "../lib/skidpadCones";

type TrackMapProps = {
  disabled: boolean;
  mapRef: RefObject<HTMLDivElement | null>;
  mapTiles: MapTile[];
  dragState: DragState | null;
  editorMode: EditorMode;
  zoom: number;
  mapCenter: GpsCoordinate;
  devicePosition: DevicePosition | null;
  visibleObstacleBoxes: VisibleObstacleBox[];
  draftObstacleRect: MapRect | null;
  obstacleCount: number;
  track: TrackPlacement;
  trackTopLeft: Point;
  trackSize: Point;
  onMapPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onMapPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onMapPointerUp: () => void;
  onTrackPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onRotatePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onZoomChange: (zoom: number) => void;
};

export function TrackMap({
  disabled,
  mapRef,
  mapTiles,
  dragState,
  editorMode,
  zoom,
  mapCenter,
  devicePosition,
  visibleObstacleBoxes,
  draftObstacleRect,
  obstacleCount,
  track,
  trackTopLeft,
  trackSize,
  onMapPointerDown,
  onMapPointerMove,
  onMapPointerUp,
  onTrackPointerDown,
  onRotatePointerDown,
  onZoomChange,
}: TrackMapProps) {
  const [showSkidpadDebug, setShowSkidpadDebug] = useState(false);
  const [showSkidpadLabels, setShowSkidpadLabels] = useState(false);

  return (
    <section
      className={`map-section ${disabled ? "is-locked" : ""}`}
      aria-disabled={disabled}
      aria-label="Map and track editor"
    >
      <div
        ref={mapRef}
        className={`map-viewport ${dragState?.type === "map" ? "is-panning" : ""} ${
          editorMode === "obstacle" ? "is-drawing-obstacle" : ""
        }`}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerUp}
      >
        <MapTiles tiles={mapTiles} />
        <div className="map-layer map-grid" />
        <div className="map-label north">N</div>
        <div className="map-label scale">OSM z{formatZoom(zoom)}</div>
        <div
          className="zoom-controls"
          aria-label="Map zoom controls"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => onZoomChange(zoom + ZOOM_STEP)}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => onZoomChange(zoom - ZOOM_STEP)}
            aria-label="Zoom out"
          >
            -
          </button>
        </div>
        <div
          className="overlay-debug-controls"
          aria-label="Skidpad overlay debug controls"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={showSkidpadDebug ? "is-active" : ""}
            onClick={() => setShowSkidpadDebug((current) => !current)}
          >
            Debug
          </button>
          <button
            type="button"
            className={showSkidpadLabels ? "is-active" : ""}
            disabled={!showSkidpadDebug}
            onClick={() => setShowSkidpadLabels((current) => !current)}
          >
            Labels
          </button>
        </div>
        {devicePosition && (
          <RobotMarker
            coordinate={devicePosition.coordinate}
            mapCenter={mapCenter}
            zoom={zoom}
          />
        )}
        <ObstacleLayer
          draftObstacleRect={draftObstacleRect}
          visibleObstacleBoxes={visibleObstacleBoxes}
        />
        <div
          className={`track-overlay ${
            editorMode === "obstacle" ? "is-obstacle-mode" : ""
          }`}
          style={{
            left: `${(trackTopLeft.x / MAP_SIZE.x) * 100}%`,
            top: `${(trackTopLeft.y / MAP_SIZE.y) * 100}%`,
            width: `${(trackSize.x / MAP_SIZE.x) * 100}%`,
            height: `${(trackSize.y / MAP_SIZE.y) * 100}%`,
            transform: `rotate(${track.rotation}deg)`,
          }}
          onPointerDown={onTrackPointerDown}
          role="button"
          tabIndex={0}
          aria-label="Draggable skidpad track overlay"
        >
          <button
            type="button"
            className="rotation-handle"
            onPointerDown={onRotatePointerDown}
            aria-label="Rotate skidpad overlay"
          />
          <SkidpadOverlay
            showDebug={showSkidpadDebug}
            showLabels={showSkidpadDebug && showSkidpadLabels}
          />
        </div>
        <a
          className="osm-attribution"
          href="https://www.openstreetmap.org/copyright"
          rel="noreferrer"
          target="_blank"
        >
          © OpenStreetMap contributors
        </a>
      </div>
      <div className="map-footer">
        <MapLegend
          hasDevicePosition={Boolean(devicePosition)}
          hasObstacles={obstacleCount > 0}
        />
        <div className="gps-readout">
          <span>{devicePosition ? "Robot GPS" : "Map center"}</span>
          <strong>
            {(devicePosition?.coordinate ?? mapCenter).lat.toFixed(6)},{" "}
            {(devicePosition?.coordinate ?? mapCenter).lng.toFixed(6)}
          </strong>
        </div>
      </div>
    </section>
  );
}

function MapTiles({ tiles }: { tiles: MapTile[] }) {
  return (
    <div className="map-layer map-tiles" aria-hidden="true">
      {tiles.map((tile) => (
        <img
          key={tile.id}
          alt=""
          draggable={false}
          src={tile.url}
          style={{
            left: `${(tile.left / MAP_SIZE.x) * 100}%`,
            top: `${(tile.top / MAP_SIZE.y) * 100}%`,
            width: `${(tile.size / MAP_SIZE.x) * 100}%`,
            height: `${(tile.size / MAP_SIZE.y) * 100}%`,
          }}
        />
      ))}
    </div>
  );
}

function ObstacleLayer({
  draftObstacleRect,
  visibleObstacleBoxes,
}: {
  draftObstacleRect: MapRect | null;
  visibleObstacleBoxes: VisibleObstacleBox[];
}) {
  return (
    <div className="map-layer obstacle-layer" aria-hidden="true">
      {visibleObstacleBoxes.map(({ obstacle, rect }, index) => (
        <div
          key={obstacle.id}
          className="obstacle-rect"
          style={{
            left: `${(rect.left / MAP_SIZE.x) * 100}%`,
            top: `${(rect.top / MAP_SIZE.y) * 100}%`,
            width: `${(rect.width / MAP_SIZE.x) * 100}%`,
            height: `${(rect.height / MAP_SIZE.y) * 100}%`,
          }}
        >
          <span>{index + 1}</span>
        </div>
      ))}
      {draftObstacleRect && (
        <div
          className="obstacle-rect is-draft"
          style={{
            left: `${(draftObstacleRect.left / MAP_SIZE.x) * 100}%`,
            top: `${(draftObstacleRect.top / MAP_SIZE.y) * 100}%`,
            width: `${(draftObstacleRect.width / MAP_SIZE.x) * 100}%`,
            height: `${(draftObstacleRect.height / MAP_SIZE.y) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

function RobotMarker({
  coordinate,
  mapCenter,
  zoom,
}: {
  coordinate: GpsCoordinate;
  mapCenter: GpsCoordinate;
  zoom: number;
}) {
  const point = gpsToMapPoint(coordinate, MAP_SIZE, mapCenter, zoom);
  const isVisible =
    point.x >= 0 && point.x <= MAP_SIZE.x && point.y >= 0 && point.y <= MAP_SIZE.y;

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="robot-marker"
      style={{
        left: `${(point.x / MAP_SIZE.x) * 100}%`,
        top: `${(point.y / MAP_SIZE.y) * 100}%`,
      }}
      title={`${coordinate.lat}, ${coordinate.lng}`}
    >
      <span />
    </div>
  );
}

function SkidpadOverlay({
  showDebug,
  showLabels,
}: {
  showDebug: boolean;
  showLabels: boolean;
}) {
  const cones = buildConePositionsMeters();
  const viewBox = `-${SKIDPAD.boundsWidthMeters / 2} -${SKIDPAD.boundsHeightMeters / 2} ${SKIDPAD.boundsWidthMeters} ${SKIDPAD.boundsHeightMeters}`;

  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      data-cone-count={cones.length}
      data-expected-cone-count={EXPECTED_TOTAL_CONES}
    >
      {showDebug && <SkidpadDebugGuides transform={SKIDPAD_OVERLAY_TRANSFORM} />}
      {cones.map((cone) =>
        renderCone(cone, SKIDPAD_OVERLAY_TRANSFORM, showLabels),
      )}
    </svg>
  );
}

function SkidpadDebugGuides({
  transform,
}: {
  transform: SkidpadOverlayTransform;
}) {
  const xStart = worldToScreen(-SKIDPAD.boundsWidthMeters / 2, 0, transform);
  const xEnd = worldToScreen(SKIDPAD.boundsWidthMeters / 2, 0, transform);
  const yStart = worldToScreen(0, -SKIDPAD.boundsHeightMeters / 2, transform);
  const yEnd = worldToScreen(0, SKIDPAD.boundsHeightMeters / 2, transform);

  return (
    <g className="skidpad-debug">
      <line x1={xStart.x} y1={xStart.y} x2={xEnd.x} y2={xEnd.y} />
      <line x1={yStart.x} y1={yStart.y} x2={yEnd.x} y2={yEnd.y} />
      {SKIDPAD_GUIDES.circleCenters.map((center) => {
        const point = worldToScreen(center.x, center.y, transform);
        return (
          <g key={`${center.x}-${center.y}`} className="skidpad-guide-center">
            <circle
              className="outer-guide"
              cx={point.x}
              cy={point.y}
              r={SKIDPAD_GUIDES.outerRadiusMeters * transform.metersToPixels}
            />
            <circle
              className="inner-guide"
              cx={point.x}
              cy={point.y}
              r={SKIDPAD_GUIDES.innerRadiusMeters * transform.metersToPixels}
            />
            <path d={`M${point.x - 0.35} ${point.y}H${point.x + 0.35}`} />
            <path d={`M${point.x} ${point.y - 0.35}V${point.y + 0.35}`} />
            <text x={point.x + 0.5} y={point.y - 0.5}>
              ({center.x.toFixed(3)}, {center.y.toFixed(3)})
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderCone(
  cone: SkidpadCone,
  transform: SkidpadOverlayTransform,
  showLabel: boolean,
) {
  const point = worldToScreen(cone.point.x, cone.point.y, transform);
  const size = cone.type === "orange_big" ? 0.95 : 0.62;
  const base = size * 0.72;

  return (
    <g
      key={cone.id}
      className={`cone ${cone.type}`}
      data-cone-type={cone.type}
      data-world-x={cone.point.x}
      data-world-y={cone.point.y}
      transform={`translate(${point.x} ${point.y})`}
    >
      <circle r={size * 0.52} />
      <path d={`M${-base} ${base} L0 ${-size} L${base} ${base} Z`} />
      {showLabel && (
        <text x={size + 0.18} y={-size - 0.16}>
          {cone.type} ({cone.point.x.toFixed(2)}, {cone.point.y.toFixed(2)})
        </text>
      )}
    </g>
  );
}

function MapLegend({
  hasDevicePosition,
  hasObstacles,
}: {
  hasDevicePosition: boolean;
  hasObstacles: boolean;
}) {
  return (
    <div className="legend" aria-label="Map legend">
      {hasDevicePosition && (
        <span>
          <i className="legend-current" /> Robot GPS
        </span>
      )}
      <span>
        <i className="legend-cone" /> Cone spray point
      </span>
      {hasObstacles && (
        <span>
          <i className="legend-obstacle" /> Obstacle
        </span>
      )}
    </div>
  );
}
