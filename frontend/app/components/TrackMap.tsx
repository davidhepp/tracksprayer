import { useState, type PointerEvent, type RefObject } from "react";

import type { GpsCoordinate, Point } from "../lib/mapMath";
import { gpsToMapPoint } from "../lib/mapMath";
import {
  MAP_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  type Cone,
  type DevicePosition,
  type DragState,
  type EditorMode,
  type MapRect,
  type MapTile,
  type TrackPlacement,
  type VisibleObstacleBox,
} from "../lib/missionTypes";
import { formatZoom } from "../lib/trackGeometry";
import type { TrackDimensions } from "../lib/trackAdapter";

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
  trackCones: Cone[];
  trackDimensions: TrackDimensions;
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
  trackCones,
  trackDimensions,
  onMapPointerDown,
  onMapPointerMove,
  onMapPointerUp,
  onTrackPointerDown,
  onRotatePointerDown,
  onZoomChange,
}: TrackMapProps) {
  const [showTrackDebug, setShowTrackDebug] = useState(false);
  const [showTrackLabels, setShowTrackLabels] = useState(false);

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
          aria-label="Track overlay debug controls"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={showTrackDebug ? "is-active" : ""}
            onClick={() => setShowTrackDebug((current) => !current)}
          >
            Debug
          </button>
          <button
            type="button"
            className={showTrackLabels ? "is-active" : ""}
            disabled={!showTrackDebug}
            onClick={() => setShowTrackLabels((current) => !current)}
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
          aria-label="Draggable track overlay"
        >
          <button
            type="button"
            className="rotation-handle"
            onPointerDown={onRotatePointerDown}
            aria-label="Rotate track overlay"
          />
          <TrackConeOverlay
            cones={trackCones}
            dimensions={trackDimensions}
            showDebug={showTrackDebug}
            showLabels={showTrackDebug && showTrackLabels}
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
          <span>{devicePosition ? "Device GPS" : "Map center"}</span>
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

function TrackConeOverlay({
  cones,
  dimensions,
  showDebug,
  showLabels,
}: {
  cones: Cone[];
  dimensions: TrackDimensions;
  showDebug: boolean;
  showLabels: boolean;
}) {
  const width = dimensions.width > 0 ? dimensions.width : 1;
  const height = dimensions.height > 0 ? dimensions.height : 1;
  const viewBox = `-${width / 2} -${height / 2} ${width} ${height}`;

  return (
    <svg viewBox={viewBox} aria-hidden="true" data-cone-count={cones.length}>
      {showDebug && <TrackDebugGuides width={width} height={height} />}
      {cones.map((cone) => (
        <TrackConeMark key={cone.id} cone={cone} showLabel={showLabels} />
      ))}
    </svg>
  );
}

function TrackDebugGuides({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const halfW = width / 2;
  const halfH = height / 2;

  return (
    <g className="skidpad-debug">
      <line x1={-halfW} y1={0} x2={halfW} y2={0} />
      <line x1={0} y1={-halfH} x2={0} y2={halfH} />
      <rect
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        fill="none"
        stroke="currentColor"
        strokeWidth={Math.max(width, height) * 0.004}
      />
    </g>
  );
}

function TrackConeMark({
  cone,
  showLabel,
}: {
  cone: Cone;
  showLabel: boolean;
}) {
  const size = cone.type === "orange_big" ? 0.95 : 0.62;
  const base = size * 0.72;

  return (
    <g
      className={`cone ${cone.type}`}
      data-cone-type={cone.type}
      data-world-x={cone.point.x}
      data-world-y={cone.point.y}
      transform={`translate(${cone.point.x} ${-cone.point.y})`}
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
          <i className="legend-current" /> Device GPS
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
