import type { ChangeEvent, FormEvent } from "react";

import type { LogEntry } from "../lib/logger";
import type { GpsCoordinate } from "../lib/mapMath";
import {
  type ConeWaypoint,
  type DevicePosition,
  type EditorMode,
  type LocationSearchResult,
  type ObstacleBox,
  type TrackPlacement,
} from "../lib/missionTypes";
import type { TrackDimensions } from "../lib/trackAdapter";
import { formatAccuracy } from "../lib/trackGeometry";
import {
  DISCIPLINE_LABELS,
  type Discipline,
  type TrackSummary,
} from "../lib/tracksApi";

type MissionControlsProps = {
  mapCenter: GpsCoordinate;
  devicePosition: DevicePosition | null;
  disabled: boolean;
  searchQuery: string;
  searchResults: LocationSearchResult[];
  searchError: string | null;
  isSearching: boolean;
  track: TrackPlacement;
  trackWarning: string | null;
  tracks: TrackSummary[];
  selectedTrackId: string;
  trackName: string;
  discipline: Discipline | null;
  trackDimensions: TrackDimensions;
  trackLoading: boolean;
  trackError: string | null;
  editorMode: EditorMode;
  obstacleCount: number;
  coneWaypointsCount: number;
  plannedConeWaypoints: ConeWaypoint[];
  onSearchSubmit: (event: FormEvent) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectLocation: (result: LocationSearchResult) => void;
  onRequestDeviceLocation: () => void;
  onSelectTrack: (id: string) => void;
  onRotationChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetTrack: () => void;
  onGenerateRoute: () => void;
  onEditorModeChange: (mode: EditorMode) => void;
  onClearObstacles: () => void;
};

type DebugPanelProps = {
  logs: LogEntry[];
  missionFiles: MissionFiles | null;
  missionFilesSaved: boolean;
  navigationReady: boolean;
  navigationRunning: boolean;
  obstacleBoxes: ObstacleBox[];
  processConnection: "connecting" | "connected" | "disconnected";
  processError: string | null;
  processExitCodes: Record<ProcessName, number | null>;
  processLogs: ProcessLogLine[];
  processPids: Record<ProcessName, number | null>;
  processStatuses: Record<ProcessName, ProcessStatus>;
  robotReady: boolean;
  sprayCheckAccepted: boolean;
  onRemoveObstacle: (id: string) => void;
  onRevealMissionFile: (kind: MissionFileKind) => void;
  onSaveMissionFiles: () => void;
  onSendRobotReady: () => void;
  onSprayCheckChange: (accepted: boolean) => void;
  onStartLocalization: () => void;
  onStartNavigation: () => void;
  onStopLocalization: () => void;
  onStopNavigation: () => void;
};

type ProcessStatus = "unknown" | "running" | "stopping" | "stopped" | "error";
type ProcessName = "localization" | "navigation";
type MissionFileKind = "waypoints" | "obstacles";
type MissionFiles = Record<MissionFileKind, string>;

type ProcessLogLine = {
  id: number;
  process: ProcessName;
  level: "stdout" | "stderr";
  message: string;
};

export function MissionControls({
  mapCenter,
  devicePosition,
  disabled,
  searchQuery,
  searchResults,
  searchError,
  isSearching,
  track,
  trackWarning,
  tracks,
  selectedTrackId,
  trackName,
  discipline,
  trackDimensions,
  trackLoading,
  trackError,
  editorMode,
  obstacleCount,
  coneWaypointsCount,
  plannedConeWaypoints,
  onSearchSubmit,
  onSearchQueryChange,
  onSelectLocation,
  onRequestDeviceLocation,
  onSelectTrack,
  onRotationChange,
  onResetTrack,
  onGenerateRoute,
  onEditorModeChange,
  onClearObstacles,
}: MissionControlsProps) {
  return (
    <aside
      className={`control-panel ${disabled ? "is-locked" : ""}`}
      aria-disabled={disabled}
      aria-label="Mission controls"
    >
      <LocationPanel
        devicePosition={devicePosition}
        isSearching={isSearching}
        mapCenter={mapCenter}
        searchError={searchError}
        searchQuery={searchQuery}
        searchResults={searchResults}
        onRequestDeviceLocation={onRequestDeviceLocation}
        onSearchQueryChange={onSearchQueryChange}
        onSearchSubmit={onSearchSubmit}
        onSelectLocation={onSelectLocation}
      />
      <TrackSetupPanel
        track={track}
        trackWarning={trackWarning}
        tracks={tracks}
        selectedTrackId={selectedTrackId}
        trackName={trackName}
        discipline={discipline}
        trackDimensions={trackDimensions}
        trackLoading={trackLoading}
        trackError={trackError}
        onSelectTrack={onSelectTrack}
        onGenerateRoute={onGenerateRoute}
        onResetTrack={onResetTrack}
        onRotationChange={onRotationChange}
      />
      <ObstacleEditorPanel
        editorMode={editorMode}
        obstacleCount={obstacleCount}
        onClearObstacles={onClearObstacles}
        onEditorModeChange={onEditorModeChange}
      />
      <section className="panel-section">
        <div className="section-heading">
          <p className="eyebrow">Output preview</p>
          <h2>Cone spray points</h2>
        </div>
        <CoordinateList
          committed={coneWaypointsCount > 0}
          waypoints={plannedConeWaypoints}
        />
      </section>
    </aside>
  );
}

export function DebugPanel({
  logs,
  missionFiles,
  missionFilesSaved,
  navigationReady,
  navigationRunning,
  obstacleBoxes,
  processConnection,
  processError,
  processExitCodes,
  processLogs,
  processPids,
  processStatuses,
  robotReady,
  sprayCheckAccepted,
  onRemoveObstacle,
  onRevealMissionFile,
  onSaveMissionFiles,
  onSendRobotReady,
  onSprayCheckChange,
  onStartLocalization,
  onStartNavigation,
  onStopLocalization,
  onStopNavigation,
}: DebugPanelProps) {
  return (
    <aside className="control-panel right-panel" aria-label="Available data and logs">
      <RobotWorkflowPanel
        connection={processConnection}
        error={processError}
        exitCodes={processExitCodes}
        logs={processLogs}
        missionFiles={missionFiles}
        missionFilesSaved={missionFilesSaved}
        navigationReady={navigationReady}
        navigationRunning={navigationRunning}
        pids={processPids}
        robotReady={robotReady}
        sprayCheckAccepted={sprayCheckAccepted}
        statuses={processStatuses}
        onRevealMissionFile={onRevealMissionFile}
        onSaveMissionFiles={onSaveMissionFiles}
        onSendRobotReady={onSendRobotReady}
        onSprayCheckChange={onSprayCheckChange}
        onStartLocalization={onStartLocalization}
        onStartNavigation={onStartNavigation}
        onStopLocalization={onStopLocalization}
        onStopNavigation={onStopNavigation}
      />

      <section className="panel-section">
        <div className="section-heading">
          <p className="eyebrow">Obstacle map</p>
          <h2>ROS coordinates</h2>
        </div>
        <ObstacleList obstacles={obstacleBoxes} onRemove={onRemoveObstacle} />
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <p className="eyebrow">Diagnostics</p>
          <h2>Event log</h2>
        </div>
        <ol className="event-log">
          {logs.map((entry) => (
            <li key={entry.id} className={entry.level}>
              <time>{entry.timestamp}</time>
              <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function RobotWorkflowPanel({
  connection,
  error,
  exitCodes,
  logs,
  missionFiles,
  missionFilesSaved,
  navigationReady,
  navigationRunning,
  pids,
  robotReady,
  sprayCheckAccepted,
  statuses,
  onRevealMissionFile,
  onSaveMissionFiles,
  onSendRobotReady,
  onSprayCheckChange,
  onStartLocalization,
  onStartNavigation,
  onStopLocalization,
  onStopNavigation,
}: {
  connection: "connecting" | "connected" | "disconnected";
  error: string | null;
  exitCodes: Record<ProcessName, number | null>;
  logs: ProcessLogLine[];
  missionFiles: MissionFiles | null;
  missionFilesSaved: boolean;
  navigationReady: boolean;
  navigationRunning: boolean;
  pids: Record<ProcessName, number | null>;
  robotReady: boolean;
  sprayCheckAccepted: boolean;
  statuses: Record<ProcessName, ProcessStatus>;
  onRevealMissionFile: (kind: MissionFileKind) => void;
  onSaveMissionFiles: () => void;
  onSendRobotReady: () => void;
  onSprayCheckChange: (accepted: boolean) => void;
  onStartLocalization: () => void;
  onStartNavigation: () => void;
  onStopLocalization: () => void;
  onStopNavigation: () => void;
}) {
  const localizationRunning =
    statuses.localization === "running" || statuses.localization === "stopping";
  const localizationStarted = statuses.localization === "running";

  return (
    <section className="panel-section">
      <div className="section-heading process-heading">
        <div>
          <p className="eyebrow">Robot workflow</p>
          <h2>Localization to navigation</h2>
        </div>
        <span className={`process-pill ${statuses.localization}`}>
          {statuses.localization}
        </span>
      </div>

      <dl className="process-state-grid">
        <div>
          <dt>WebSocket</dt>
          <dd>{connection}</dd>
        </div>
        <div>
          <dt>Localization</dt>
          <dd>{pids.localization ?? statuses.localization}</dd>
        </div>
        <div>
          <dt>Navigation</dt>
          <dd>{pids.navigation ?? statuses.navigation}</dd>
        </div>
      </dl>

      <ol className="workflow-steps">
        <li>
          <div>
            <strong>1. Start localization</strong>
            <span>Runs the mocked Phase 1 script now, real Pi script later.</span>
          </div>
          <button
            type="button"
            className="primary-button small-button"
            disabled={localizationRunning}
            onClick={onStartLocalization}
          >
            Start
          </button>
        </li>
        <li>
          <div>
            <strong>2. Confirm READY</strong>
            <span>Waits for the robot READY message over rosbridge.</span>
          </div>
          <button
            type="button"
            className="secondary-button small-button"
            disabled={!localizationStarted || robotReady}
            onClick={onSendRobotReady}
          >
            READY
          </button>
        </li>
        <li>
          <label className="workflow-check">
            <input
              checked={sprayCheckAccepted}
              type="checkbox"
              onChange={(event) => onSprayCheckChange(event.target.checked)}
            />
            <span>Spray can checked or drive anyway</span>
          </label>
          <button
            type="button"
            className="secondary-button small-button"
            disabled={!robotReady || !sprayCheckAccepted}
            onClick={onSaveMissionFiles}
          >
            Save JSON
          </button>
        </li>
        <li>
          <div>
            <strong>4. Align and start navigation</strong>
            <span>After manual alignment, starts mocked Phase 2.</span>
          </div>
          <button
            type="button"
            className="primary-button small-button"
            disabled={!navigationReady || navigationRunning}
            onClick={onStartNavigation}
          >
            Navigate
          </button>
        </li>
      </ol>

      {missionFilesSaved && missionFiles && (
        <div className="mission-file-list" aria-label="Saved mission JSON files">
          <button
            type="button"
            className="file-reveal-button"
            onClick={() => onRevealMissionFile("waypoints")}
          >
            <span>Waypoints JSON</span>
            <code>{missionFiles.waypoints}</code>
          </button>
          <button
            type="button"
            className="file-reveal-button"
            onClick={() => onRevealMissionFile("obstacles")}
          >
            <span>Obstacles JSON</span>
            <code>{missionFiles.obstacles}</code>
          </button>
        </div>
      )}

      {error && (
        <p className="process-error" role="status">
          {error}
        </p>
      )}

      <div className="button-row compact-buttons">
        <button
          type="button"
          className="secondary-button small-button"
          disabled={!localizationRunning}
          onClick={onStopLocalization}
        >
          Stop loc
        </button>
        <button
          type="button"
          className="secondary-button small-button"
          disabled={!navigationRunning}
          onClick={onStopNavigation}
        >
          Stop nav
        </button>
      </div>

      <dl className="process-state-grid">
        <div>
          <dt>Loc exit</dt>
          <dd>{exitCodes.localization ?? "none"}</dd>
        </div>
        <div>
          <dt>Nav exit</dt>
          <dd>{exitCodes.navigation ?? "none"}</dd>
        </div>
        <div>
          <dt>Files</dt>
          <dd>{missionFilesSaved ? "saved" : "pending"}</dd>
        </div>
      </dl>

      <ol className="process-log" aria-label="Demo process log output">
        {logs.length === 0 ? (
          <li className="empty-log">No process output yet.</li>
        ) : (
          logs.map((line) => (
            <li key={line.id} className={line.level}>
              <span>{line.process}</span>
              <code>{line.message}</code>
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

function LocationPanel({
  mapCenter,
  devicePosition,
  searchQuery,
  searchResults,
  searchError,
  isSearching,
  onSearchSubmit,
  onSearchQueryChange,
  onSelectLocation,
  onRequestDeviceLocation,
}: {
  mapCenter: GpsCoordinate;
  devicePosition: DevicePosition | null;
  searchQuery: string;
  searchResults: LocationSearchResult[];
  searchError: string | null;
  isSearching: boolean;
  onSearchSubmit: (event: FormEvent) => void;
  onSearchQueryChange: (query: string) => void;
  onSelectLocation: (result: LocationSearchResult) => void;
  onRequestDeviceLocation: () => void;
}) {
  return (
    <section className="panel-section">
      <div className="section-heading">
        <p className="eyebrow">Real map source</p>
        <h2>Location</h2>
      </div>
      <form className="location-search" onSubmit={onSearchSubmit}>
        <label htmlFor="location-search">Search location</label>
        <div>
          <input
            id="location-search"
            name="location-search"
            placeholder="Schweinfurt, Germany"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? "..." : "Search"}
          </button>
        </div>
        {searchError && <p role="status">{searchError}</p>}
      </form>
      {searchResults.length > 0 && (
        <ol className="search-results">
          {searchResults.map((result) => (
            <li key={result.id}>
              <button type="button" onClick={() => onSelectLocation(result)}>
                <span>{result.label}</span>
                <small>
                  {result.coordinate.lat.toFixed(6)},{" "}
                  {result.coordinate.lng.toFixed(6)}
                </small>
              </button>
            </li>
          ))}
        </ol>
      )}
      <CoordinateCard
        label="Current map center"
        coordinate={mapCenter}
        detail={
          devicePosition
            ? `Device GPS, ${formatAccuracy(devicePosition.accuracyMeters)}`
            : "Default: Schweinfurt, Germany"
        }
      />
      <button
        type="button"
        className="primary-button full-width-button"
        onClick={onRequestDeviceLocation}
      >
        Use device GPS
      </button>
    </section>
  );
}

function TrackSetupPanel({
  track,
  trackWarning,
  tracks,
  selectedTrackId,
  trackName,
  discipline,
  trackDimensions,
  trackLoading,
  trackError,
  onSelectTrack,
  onRotationChange,
  onResetTrack,
  onGenerateRoute,
}: {
  track: TrackPlacement;
  trackWarning: string | null;
  tracks: TrackSummary[];
  selectedTrackId: string;
  trackName: string;
  discipline: Discipline | null;
  trackDimensions: TrackDimensions;
  trackLoading: boolean;
  trackError: string | null;
  onSelectTrack: (id: string) => void;
  onRotationChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetTrack: () => void;
  onGenerateRoute: () => void;
}) {
  const presetTracks = tracks.filter((item) => item.isPreset);
  const generatedTracks = tracks.filter((item) => !item.isPreset);

  return (
    <section className="panel-section">
      <div className="section-heading">
        <p className="eyebrow">Track overlay</p>
        <h2>Track setup</h2>
      </div>
      <label className="field-control">
        <span>Track</span>
        <select
          value={selectedTrackId}
          disabled={trackLoading || tracks.length === 0}
          onChange={(event) => onSelectTrack(event.target.value)}
        >
          {tracks.length === 0 && <option value="">No tracks available</option>}
          {presetTracks.length > 0 && (
            <optgroup label="Standard presets">
              {presetTracks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          )}
          {generatedTracks.length > 0 && (
            <optgroup label="Generated">
              {generatedTracks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {trackError && (
        <p className="process-error" role="status">
          {trackError}
        </p>
      )}
      <div className="dimension-list">
        <span>
          {trackName || "Track"}
          {discipline ? ` · ${DISCIPLINE_LABELS[discipline]}` : ""}
          {trackLoading ? " (loading…)" : ""}
        </span>
        <span>
          Size: {trackDimensions.width.toFixed(1)} x{" "}
          {trackDimensions.height.toFixed(1)} m (real size)
        </span>
      </div>
      <label className="range-control">
        <span>Rotation</span>
        <input
          min="-180"
          max="180"
          step="1"
          type="range"
          value={track.rotation}
          onChange={onRotationChange}
        />
        <strong>{track.rotation} deg</strong>
      </label>
      {trackWarning && (
        <p className="warning-banner" role="status">
          {trackWarning}
        </p>
      )}
      <div className="button-row">
        <button type="button" className="secondary-button" onClick={onResetTrack}>
          Reset
        </button>
        <button type="button" className="primary-button" onClick={onGenerateRoute}>
          Go
        </button>
      </div>
    </section>
  );
}

function ObstacleEditorPanel({
  editorMode,
  obstacleCount,
  onEditorModeChange,
  onClearObstacles,
}: {
  editorMode: EditorMode;
  obstacleCount: number;
  onEditorModeChange: (mode: EditorMode) => void;
  onClearObstacles: () => void;
}) {
  return (
    <section className="panel-section">
      <div className="section-heading compact-heading">
        <p className="eyebrow">Obstacle editor</p>
        <h2>Rectangle boxes</h2>
      </div>
      <div className="mode-toggle" role="group" aria-label="Map interaction mode">
        <button
          type="button"
          className={editorMode === "navigate" ? "is-active" : ""}
          onClick={() => onEditorModeChange("navigate")}
        >
          Move map
        </button>
        <button
          type="button"
          className={editorMode === "obstacle" ? "is-active" : ""}
          onClick={() => onEditorModeChange("obstacle")}
        >
          Draw obstacle
        </button>
      </div>
      <div className="button-row compact-buttons">
        <button
          type="button"
          className="secondary-button"
          disabled={obstacleCount === 0}
          onClick={onClearObstacles}
        >
          Clear boxes
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => onEditorModeChange("navigate")}
        >
          Done
        </button>
      </div>
      <p className="helper-text">
        {editorMode === "obstacle"
          ? "Drag on the map to create an obstacle rectangle."
          : `${obstacleCount} obstacle box(es) in the ROS export.`}
      </p>
    </section>
  );
}

function CoordinateCard({
  label,
  coordinate,
  detail,
}: {
  label: string;
  coordinate: GpsCoordinate;
  detail: string;
}) {
  return (
    <div className="coordinate-card">
      <span>{label}</span>
      <strong>
        {coordinate.lat.toFixed(6)}, {coordinate.lng.toFixed(6)}
      </strong>
      <small>{detail}</small>
    </div>
  );
}

function CoordinateList({
  committed,
  waypoints,
}: {
  committed: boolean;
  waypoints: ConeWaypoint[];
}) {
  return (
    <div className="coordinate-box">
      <div className="coordinate-state">
        <span>{committed ? "Generated points" : "Live preview"}</span>
        <strong>{waypoints.length} pts</strong>
      </div>
      <ol>
        {waypoints.slice(0, 10).map((waypoint, index) => (
          <li key={waypoint.id}>
            <span className={`cone-index ${waypoint.color}`}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <code>
              {waypoint.coordinate.lat.toFixed(7)},{" "}
              {waypoint.coordinate.lng.toFixed(7)}
            </code>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ObstacleList({
  obstacles,
  onRemove,
}: {
  obstacles: ObstacleBox[];
  onRemove: (id: string) => void;
}) {
  if (obstacles.length === 0) {
    return (
      <p className="empty-state">
        Draw a rectangle on the map to create ROS obstacle boxes.
      </p>
    );
  }

  return (
    <ol className="obstacle-list">
      {obstacles.map((obstacle, index) => (
        <li key={obstacle.id}>
          <div>
            <span>Obstacle {index + 1}</span>
            <code>
              lat {obstacle.lat_min.toFixed(7)} to {obstacle.lat_max.toFixed(7)}
              <br />
              lon {obstacle.lon_min.toFixed(7)} to {obstacle.lon_max.toFixed(7)}
            </code>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => onRemove(obstacle.id)}
            aria-label={`Remove obstacle ${index + 1}`}
          >
            x
          </button>
        </li>
      ))}
    </ol>
  );
}
