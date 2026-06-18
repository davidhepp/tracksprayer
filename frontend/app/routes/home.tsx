import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent,
} from "react";

import { DebugPanel, MissionControls } from "../components/OperatorPanels";
import { TrackMap } from "../components/TrackMap";
import { createLogEntry, writeConsoleLog } from "../lib/logger";
import type { GpsCoordinate, Point } from "../lib/mapMath";
import {
  clamp,
  gpsToMapPoint,
  gpsToWorldPixel,
  mapPointToGps,
  metersPerPixel,
  worldPixelToGps,
} from "../lib/mapMath";
import {
  DEFAULT_ZOOM,
  MAP_SIZE,
  MAX_LOG_ENTRIES,
  MAX_TRACK_SCALE,
  MAX_ZOOM,
  MIN_OBSTACLE_SIZE_PX,
  MIN_TRACK_SCALE,
  MIN_ZOOM,
  OSM_TILE_URL,
  SCHWEINFURT_CENTER,
  SKIDPAD,
  ZOOM_STEP,
  type DevicePosition,
  type ConeWaypoint,
  type DragState,
  type EditorMode,
  type LocationSearchResult,
  type ObstacleBox,
  type TrackPlacement,
} from "../lib/missionTypes";
import { buildRosPayload } from "../lib/rosPayload";
import {
  angleBetween,
  buildConeWaypoints,
  buildMapTiles,
  formatZoom,
  mapRectToObstacleBox,
  normalizeRotation,
  obstacleBoxToMapRect,
  pointsToRect,
  zoomAroundAnchor,
} from "../lib/trackGeometry";
import type { Route } from "./+types/home";

function backendHttpBaseUrl() {
  if (import.meta.env.VITE_ROBOT_BACKEND_URL) {
    return import.meta.env.VITE_ROBOT_BACKEND_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }

  return "http://localhost:8000";
}

const BACKEND_HTTP_BASE_URL = backendHttpBaseUrl();

const initialTrack = {
  center: SCHWEINFURT_CENTER,
  rotation: 0,
} satisfies TrackPlacement;

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

type ProcessSocketMessage =
  | {
      type: "process_status";
      process: ProcessName;
      status: "running" | "stopping" | "stopped";
      pid?: number;
      exit_code?: number;
    }
  | {
      type: "log";
      process: ProcessName;
      level: "stdout" | "stderr";
      message: string;
    };

type BackendProcessStatus = Record<
  ProcessName,
  {
    running: boolean;
    pid?: number;
  }
>;

type RobotGpsFixResponse = {
  ok: boolean;
  lat: number;
  lng: number;
  accuracy_meters: number | null;
  status: number | null;
};

function backendWsUrl() {
  const url = new URL(BACKEND_HTTP_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/process";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TrackSprayer Operator" },
    {
      name: "description",
      content: "Frontend for configuring track spray missions with real GPS coordinates.",
    },
  ];
}

export default function Home() {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapCenter, setMapCenter] = useState<GpsCoordinate>(SCHWEINFURT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [devicePosition, setDevicePosition] = useState<DevicePosition | null>(
    null,
  );
  const [track, setTrack] = useState<TrackPlacement>(initialTrack);
  const [trackScale, setTrackScale] = useState(1);
  const [editorMode, setEditorMode] = useState<EditorMode>("navigate");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [coneWaypoints, setConeWaypoints] = useState<ConeWaypoint[]>([]);
  const [obstacleBoxes, setObstacleBoxes] = useState<ObstacleBox[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LocationSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [logs, setLogs] = useState([
    createLogEntry("info", "Map initialized at Schweinfurt, Germany.", 1),
  ]);
  const [processStatuses, setProcessStatuses] = useState<
    Record<ProcessName, ProcessStatus>
  >({
    localization: "unknown",
    navigation: "unknown",
  });
  const [processPids, setProcessPids] = useState<
    Record<ProcessName, number | null>
  >({
    localization: null,
    navigation: null,
  });
  const [processExitCodes, setProcessExitCodes] = useState<
    Record<ProcessName, number | null>
  >({
    localization: null,
    navigation: null,
  });
  const [processLogs, setProcessLogs] = useState<ProcessLogLine[]>([]);
  const [processConnection, setProcessConnection] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [processError, setProcessError] = useState<string | null>(null);
  const [robotReady, setRobotReady] = useState(false);
  const [sprayCheckAccepted, setSprayCheckAccepted] = useState(false);
  const [missionFilesSaved, setMissionFilesSaved] = useState(false);
  const [missionFiles, setMissionFiles] = useState<MissionFiles | null>(null);

  const addLog = useCallback(
    (
      level: "info" | "warn" | "error",
      message: string,
      details?: unknown,
    ) => {
      writeConsoleLog("TrackSprayer UI", level, message, details);
      setLogs((current) => [
        createLogEntry(level, message),
        ...current.slice(0, MAX_LOG_ENTRIES - 1),
      ]);
    },
    [],
  );

  useEffect(() => {
    writeConsoleLog("TrackSprayer UI", "info", "Frontend initialized.", {
      mapCenter: SCHWEINFURT_CENTER,
      mapZoom: DEFAULT_ZOOM,
      tileProvider: OSM_TILE_URL,
    });
  }, []);

  useEffect(() => {
    let isActive = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    fetch(`${BACKEND_HTTP_BASE_URL}/process/status`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Backend status failed with ${response.status}.`);
        }
        return response.json() as Promise<BackendProcessStatus>;
      })
      .then((status) => {
        if (!isActive) {
          return;
        }

        setProcessStatuses({
          localization: status.localization.running ? "running" : "stopped",
          navigation: status.navigation.running ? "running" : "stopped",
        });
        setProcessPids({
          localization: status.localization.pid ?? null,
          navigation: status.navigation.pid ?? null,
        });
        setProcessError(null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Backend status unavailable.";
        setProcessStatuses({
          localization: "error",
          navigation: "error",
        });
        setProcessError(message);
        addLog("warn", message);
      });

    const scheduleReconnect = () => {
      if (!isActive || reconnectTimer !== null) {
        return;
      }

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectProcessSocket();
      }, 1500);
    };

    const connectProcessSocket = () => {
      if (!isActive) {
        return;
      }

      const wsUrl = backendWsUrl();
      writeConsoleLog("TrackSprayer UI", "info", "Connecting process WebSocket.", {
        wsUrl,
      });
      setProcessConnection("connecting");

      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        if (!isActive) {
          return;
        }

        setProcessConnection("connected");
        setProcessError(null);
      });

      socket.addEventListener("message", (event) => {
        if (!isActive) {
          return;
        }

        const message = JSON.parse(event.data) as ProcessSocketMessage;

        if (message.type === "process_status") {
          setProcessStatuses((current) => ({
            ...current,
            [message.process]: message.status,
          }));
          setProcessPids((current) => ({
            ...current,
            [message.process]: message.pid ?? null,
          }));
          setProcessExitCodes((current) => ({
            ...current,
            [message.process]:
              message.status === "stopped" ? message.exit_code ?? null : null,
          }));
          if (message.process === "localization" && message.status !== "running") {
            setRobotReady(false);
            setMissionFilesSaved(false);
          }
          if (message.process === "navigation" && message.status === "running") {
            setMissionFilesSaved(true);
          }
          return;
        }

        if (message.type === "log") {
          setProcessLogs((current) => [
            {
              id: Date.now() + Math.random(),
              process: message.process,
              level: message.level,
              message: message.message,
            },
            ...current.slice(0, 99),
          ]);
        }
      });

      socket.addEventListener("close", () => {
        if (!isActive) {
          return;
        }

        setProcessConnection("disconnected");
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (!isActive) {
          return;
        }

        setProcessConnection("disconnected");
        setProcessError("Process WebSocket is not connected.");
      });
    };

    connectProcessSocket();

    return () => {
      isActive = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [addLog]);

  const mapTiles = useMemo(
    () => buildMapTiles(mapCenter, zoom, MAP_SIZE),
    [mapCenter, zoom],
  );
  const trackResolution = metersPerPixel(mapCenter.lat, zoom);
  const trackSize = useMemo(
    () => ({
      x: (SKIDPAD.boundsWidthMeters * trackScale) / trackResolution,
      y: (SKIDPAD.boundsHeightMeters * trackScale) / trackResolution,
    }),
    [trackResolution, trackScale],
  );
  const trackCenterPoint = useMemo(
    () => gpsToMapPoint(track.center, MAP_SIZE, mapCenter, zoom),
    [mapCenter, track.center, zoom],
  );
  const trackTopLeft = useMemo(
    () => ({
      x: trackCenterPoint.x - trackSize.x / 2,
      y: trackCenterPoint.y - trackSize.y / 2,
    }),
    [trackCenterPoint, trackSize],
  );
  const trackWarning = useMemo(() => {
    if (trackSize.x > MAP_SIZE.x * 0.9 || trackSize.y > MAP_SIZE.y * 0.9) {
      return "Current zoom makes the scaled skidpad larger than the visible map.";
    }

    if (
      trackTopLeft.x + trackSize.x < 0 ||
      trackTopLeft.y + trackSize.y < 0 ||
      trackTopLeft.x > MAP_SIZE.x ||
      trackTopLeft.y > MAP_SIZE.y
    ) {
      return "Skidpad overlay is outside the visible map area.";
    }

    return null;
  }, [trackSize, trackTopLeft]);
  const previewConeWaypoints = useMemo(
    () => buildConeWaypoints(track, trackScale, zoom),
    [track, trackScale, zoom],
  );
  const plannedConeWaypoints =
    coneWaypoints.length > 0
      ? coneWaypoints
      : previewConeWaypoints;
  const visibleObstacleBoxes = useMemo(
    () =>
      obstacleBoxes
        .map((obstacle) => ({
          obstacle,
          rect: obstacleBoxToMapRect(obstacle, mapCenter, zoom),
        }))
        .filter(
          ({ rect }) =>
            rect.left + rect.width >= 0 &&
            rect.top + rect.height >= 0 &&
            rect.left <= MAP_SIZE.x &&
            rect.top <= MAP_SIZE.y,
        ),
    [mapCenter, obstacleBoxes, zoom],
  );
  const draftObstacleRect =
    dragState?.type === "obstacle"
      ? pointsToRect(dragState.startPoint, dragState.currentPoint)
      : null;
  const localizationRunning = processStatuses.localization === "running";
  const navigationRunning = processStatuses.navigation === "running";
  const missionLocked = !localizationRunning;
  const navigationReady =
    localizationRunning && robotReady && sprayCheckAccepted && missionFilesSaved;

  const toMapPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = mapRef.current?.getBoundingClientRect();

      if (!rect || rect.width === 0 || rect.height === 0) {
        addLog("error", "Map viewport is unavailable for pointer conversion.");
        return { x: MAP_SIZE.x / 2, y: MAP_SIZE.y / 2 };
      }

      return {
        x: clamp(
          ((clientX - rect.left) / rect.width) * MAP_SIZE.x,
          0,
          MAP_SIZE.x,
        ),
        y: clamp(
          ((clientY - rect.top) / rect.height) * MAP_SIZE.y,
          0,
          MAP_SIZE.y,
        ),
      };
    },
    [addLog],
  );

  const moveTrack = useCallback(
    (point: Point, pointerOffset: Point) => {
      const maxX = Math.max(MAP_SIZE.x - trackSize.x, 0);
      const maxY = Math.max(MAP_SIZE.y - trackSize.y, 0);
      const nextTopLeft = {
        x: clamp(point.x - pointerOffset.x, 0, maxX),
        y: clamp(point.y - pointerOffset.y, 0, maxY),
      };
      const nextCenterPoint = {
        x: nextTopLeft.x + trackSize.x / 2,
        y: nextTopLeft.y + trackSize.y / 2,
      };

      setTrack((current) => ({
        ...current,
        center: mapPointToGps(nextCenterPoint, MAP_SIZE, mapCenter, zoom),
      }));
      setConeWaypoints([]);
    },
    [mapCenter, trackSize, zoom],
  );

  const panMap = useCallback(
    (point: Point, startPoint: Point, startCenter: GpsCoordinate) => {
      const startWorld = gpsToWorldPixel(startCenter, zoom);
      const delta = {
        x: startPoint.x - point.x,
        y: startPoint.y - point.y,
      };

      setMapCenter(
        worldPixelToGps(
          {
            x: startWorld.x + delta.x,
            y: startWorld.y + delta.y,
          },
          zoom,
        ),
      );
      setConeWaypoints([]);
    },
    [zoom],
  );

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (missionLocked || editorMode === "obstacle") {
      return;
    }

    const point = toMapPoint(event.clientX, event.clientY);
    setDragState({
      type: "track",
      pointerOffset: {
        x: point.x - trackTopLeft.x,
        y: point.y - trackTopLeft.y,
      },
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const handleRotatePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (missionLocked || editorMode === "obstacle") {
      return;
    }

    const point = toMapPoint(event.clientX, event.clientY);
    const centerPoint = {
      x: trackTopLeft.x + trackSize.x / 2,
      y: trackTopLeft.y + trackSize.y / 2,
    };

    setDragState({
      type: "rotate",
      centerPoint,
      startAngle: angleBetween(centerPoint, point),
      startRotation: track.rotation,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const handleMapPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (missionLocked) {
      return;
    }

    const point = toMapPoint(event.clientX, event.clientY);

    if (editorMode === "obstacle") {
      setDragState({
        type: "obstacle",
        startPoint: point,
        currentPoint: point,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    setDragState({
      type: "map",
      startPoint: point,
      startCenter: mapCenter,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMapPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (missionLocked || !dragState) {
      return;
    }

    const point = toMapPoint(event.clientX, event.clientY);

    if (dragState.type === "track") {
      moveTrack(point, dragState.pointerOffset);
      return;
    }

    if (dragState.type === "rotate") {
      const delta = angleBetween(dragState.centerPoint, point) - dragState.startAngle;
      setTrack((current) => ({
        ...current,
        rotation: normalizeRotation(dragState.startRotation + delta),
      }));
      setConeWaypoints([]);
      return;
    }

    if (dragState.type === "obstacle") {
      setDragState({ ...dragState, currentPoint: point });
      return;
    }

    panMap(point, dragState.startPoint, dragState.startCenter);
  };

  const handleMapPointerUp = () => {
    if (missionLocked || !dragState) {
      return;
    }

    if (dragState.type === "obstacle") {
      const rect = pointsToRect(dragState.startPoint, dragState.currentPoint);

      if (rect.width >= MIN_OBSTACLE_SIZE_PX && rect.height >= MIN_OBSTACLE_SIZE_PX) {
        const obstacle = mapRectToObstacleBox(rect, MAP_SIZE, mapCenter, zoom);
        setObstacleBoxes((current) => [...current, obstacle]);
        invalidateMissionFiles();
        addLog("info", "Obstacle rectangle added.", obstacle);
      } else {
        addLog("warn", "Obstacle rectangle ignored because it was too small.");
      }
    }

    setDragState(null);
  };

  const handleRotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rotation = Number(event.target.value);
    setTrack((current) => ({ ...current, rotation }));
    setConeWaypoints([]);
    invalidateMissionFiles();
    addLog("info", `Track rotation set to ${rotation} degrees.`);
  };

  const handleTrackScaleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const scale = clamp(
      Number(event.target.value),
      MIN_TRACK_SCALE,
      MAX_TRACK_SCALE,
    );
    setTrackScale(scale);
    setConeWaypoints([]);
    invalidateMissionFiles();
    addLog("info", `Track test scale set to ${Math.round(scale * 100)}%.`);
  };

  const handleGenerateRoute = () => {
    const waypoints = buildConeWaypoints(track, trackScale, zoom);
    setConeWaypoints(waypoints);
    invalidateMissionFiles();
    addLog("info", `Generated ${waypoints.length} cone spray points.`, {
      first: waypoints[0],
      last: waypoints.at(-1),
    });
  };

  const resetTrack = () => {
    setTrack({
      center: mapCenter,
      rotation: 0,
    });
    setConeWaypoints([]);
    invalidateMissionFiles();
    addLog("info", "Skidpad overlay reset to the current map center.");
  };

  const handleEditorModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
    setDragState(null);
  };

  const clearObstacles = () => {
    setObstacleBoxes([]);
    invalidateMissionFiles();
    addLog("info", "Obstacle map cleared.");
  };

  const removeObstacle = (id: string) => {
    setObstacleBoxes((current) =>
      current.filter((obstacle) => obstacle.id !== id),
    );
    invalidateMissionFiles();
    addLog("info", "Obstacle rectangle removed.", { id });
  };

  const startProcess = async (name: ProcessName) => {
    try {
      const response = await fetch(
        `${BACKEND_HTTP_BASE_URL}/process/${name}/start`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(`Start failed with ${response.status}.`);
      }

      const result = (await response.json()) as { status: string };
      if (result.status === "started" || result.status === "already_running") {
        setProcessStatuses((current) => ({ ...current, [name]: "running" }));
      }
      setProcessError(null);
      addLog("info", `${name} process ${result.status}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${name} process start failed.`;
      setProcessStatuses((current) => ({ ...current, [name]: "error" }));
      setProcessError(message);
      addLog("error", message);
    }
  };

  const stopProcess = async (name: ProcessName) => {
    try {
      const response = await fetch(
        `${BACKEND_HTTP_BASE_URL}/process/${name}/stop`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(`Stop failed with ${response.status}.`);
      }

      const result = (await response.json()) as { status: string };
      if (result.status === "stopping" || result.status === "not_running") {
        setProcessStatuses((current) => ({
          ...current,
          [name]: result.status === "stopping" ? "stopping" : "stopped",
        }));
        if (name === "localization") {
          setRobotReady(false);
          setMissionFilesSaved(false);
          setMissionFiles(null);
        }
      }
      setProcessError(null);
      addLog("info", `${name} process ${result.status}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `${name} process stop failed.`;
      setProcessStatuses((current) => ({ ...current, [name]: "error" }));
      setProcessError(message);
      addLog("error", message);
    }
  };

  const sendRobotReady = async () => {
    try {
      const response = await fetch(`${BACKEND_HTTP_BASE_URL}/robot/ready`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`READY failed with ${response.status}.`);
      }

      const result = (await response.json()) as {
        status: string;
        mode: string;
        source?: string;
        topic?: string;
      };
      if (result.status !== "ready_received") {
        throw new Error(`Unexpected READY status: ${result.status}.`);
      }

      setRobotReady(true);
      setProcessError(null);
      addLog(
        "info",
        `Robot READY received from ${result.source ?? "robot"} (${result.mode}).`,
        result,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Robot READY failed.";
      setProcessError(message);
      addLog("error", message);
    }
  };

  const saveMissionFiles = async () => {
    const waypoints =
      coneWaypoints.length > 0 ? coneWaypoints : buildConeWaypoints(track, trackScale, zoom);
    const payload = buildRosPayload(track, trackScale, waypoints, obstacleBoxes);

    try {
      const response = await fetch(`${BACKEND_HTTP_BASE_URL}/mission/files`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          waypoints: payload.points_to_mark,
          obstacles: payload.obstacle_boxes_ros,
        }),
      });

      if (!response.ok) {
        throw new Error(`Mission file save failed with ${response.status}.`);
      }

      const result = (await response.json()) as {
        waypoints_file: string;
        obstacles_file: string;
      };
      setConeWaypoints(waypoints);
      setMissionFilesSaved(true);
      setMissionFiles({
        waypoints: result.waypoints_file,
        obstacles: result.obstacles_file,
      });
      setProcessError(null);
      addLog("info", "Mission JSON written for navigation.", result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mission JSON save failed.";
      setMissionFilesSaved(false);
      setProcessError(message);
      addLog("error", message);
    }
  };

  const invalidateMissionFiles = () => {
    setMissionFilesSaved(false);
    setMissionFiles(null);
  };

  const revealMissionFile = async (kind: MissionFileKind) => {
    try {
      const response = await fetch(`${BACKEND_HTTP_BASE_URL}/mission/files/reveal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ kind }),
      });

      if (!response.ok) {
        throw new Error(`Reveal failed with ${response.status}.`);
      }

      const result = (await response.json()) as { path: string };
      addLog("info", `Revealed ${kind} JSON.`, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Mission file reveal failed.";
      addLog("warn", message);
    }
  };

  const changeZoom = (
    nextZoom: number,
    anchor = { x: MAP_SIZE.x / 2, y: MAP_SIZE.y / 2 },
  ) => {
    const steppedZoom = Math.round(nextZoom / ZOOM_STEP) * ZOOM_STEP;
    const constrainedZoom = clamp(steppedZoom, MIN_ZOOM, MAX_ZOOM);

    if (constrainedZoom === zoom) {
      return;
    }

    setZoom(constrainedZoom);
    setMapCenter(
      zoomAroundAnchor({
        anchor,
        currentCenter: mapCenter,
        currentZoom: zoom,
        nextZoom: constrainedZoom,
        mapSize: MAP_SIZE,
      }),
    );
    setConeWaypoints([]);
    addLog("info", `Map zoom set to z${formatZoom(constrainedZoom)}.`);
  };

  const requestDeviceLocation = async () => {
    addLog("info", "Requesting robot GPS fix.");

    try {
      const response = await fetch(`${BACKEND_HTTP_BASE_URL}/robot/gps/fix`);
      if (!response.ok) {
        throw new Error(`Robot GPS fix failed with ${response.status}.`);
      }

      const result = (await response.json()) as RobotGpsFixResponse;
      const coordinate = {
        lat: result.lat,
        lng: result.lng,
      };
      const acquiredAt = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      setDevicePosition({
        coordinate,
        accuracyMeters:
          typeof result.accuracy_meters === "number"
            ? Math.round(result.accuracy_meters)
            : null,
        acquiredAt,
      });
      setMapCenter(coordinate);
      setTrack((current) => ({ ...current, center: coordinate }));
      setConeWaypoints([]);
      addLog("info", "Robot GPS fix received and map recentered.", {
        coordinate,
        accuracyMeters: result.accuracy_meters,
        status: result.status,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Robot GPS fix failed.";
      addLog("warn", message);
    }
  };

  const handleLocationSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();

    if (query.length < 3) {
      setSearchError("Enter at least 3 characters.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "5",
        addressdetails: "0",
      });
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}.`);
      }

      const results = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
      }>;
      const parsedResults = results
        .map((result) => ({
          id: String(result.place_id),
          label: result.display_name,
          coordinate: {
            lat: Number(Number(result.lat).toFixed(7)),
            lng: Number(Number(result.lon).toFixed(7)),
          },
        }))
        .filter(
          (result) =>
            Number.isFinite(result.coordinate.lat) &&
            Number.isFinite(result.coordinate.lng),
        );

      setSearchResults(parsedResults);

      if (parsedResults.length === 0) {
        setSearchError("No matching location found.");
      }

      addLog("info", `Location search returned ${parsedResults.length} result(s).`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Location search failed.";
      setSearchError(message);
      addLog("warn", message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    setSearchError(null);
  };

  const selectLocation = (result: LocationSearchResult) => {
    setMapCenter(result.coordinate);
    setTrack((current) => ({ ...current, center: result.coordinate }));
    setConeWaypoints([]);
    setSearchResults([]);
    setSearchQuery(result.label);
    addLog("info", "Map recentered to searched location.", {
      label: result.label,
      coordinate: result.coordinate,
    });
  };

  return (
    <main className="operator-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Formula Student ROS frontend</p>
          <h1>TrackSprayer Operator</h1>
        </div>
        <div className="spray-status" aria-label="Spray can level">
          <span>Spray can</span>
          <strong>100%</strong>
        </div>
      </header>

      <section className="workspace" aria-label="Track configuration workspace">
        <MissionControls
          coneWaypointsCount={coneWaypoints.length}
          devicePosition={devicePosition}
          disabled={missionLocked}
          editorMode={editorMode}
          isSearching={isSearching}
          mapCenter={mapCenter}
          obstacleCount={obstacleBoxes.length}
          plannedConeWaypoints={plannedConeWaypoints}
          searchError={searchError}
          searchQuery={searchQuery}
          searchResults={searchResults}
          track={track}
          trackScale={trackScale}
          trackWarning={trackWarning}
          onClearObstacles={clearObstacles}
          onEditorModeChange={handleEditorModeChange}
          onGenerateRoute={handleGenerateRoute}
          onRequestDeviceLocation={requestDeviceLocation}
          onResetTrack={resetTrack}
          onRotationChange={handleRotationChange}
          onSearchQueryChange={handleSearchQueryChange}
          onSearchSubmit={handleLocationSearch}
          onSelectLocation={selectLocation}
          onTrackScaleChange={handleTrackScaleChange}
        />

        <TrackMap
          disabled={missionLocked}
          devicePosition={devicePosition}
          draftObstacleRect={draftObstacleRect}
          dragState={dragState}
          editorMode={editorMode}
          mapCenter={mapCenter}
          mapRef={mapRef}
          mapTiles={mapTiles}
          obstacleCount={obstacleBoxes.length}
          track={track}
          trackSize={trackSize}
          trackTopLeft={trackTopLeft}
          visibleObstacleBoxes={visibleObstacleBoxes}
          zoom={zoom}
          onMapPointerDown={handleMapPointerDown}
          onMapPointerMove={handleMapPointerMove}
          onMapPointerUp={handleMapPointerUp}
          onRotatePointerDown={handleRotatePointerDown}
          onTrackPointerDown={handleTrackPointerDown}
          onZoomChange={changeZoom}
        />

        <DebugPanel
          logs={logs}
          missionFiles={missionFiles}
          missionFilesSaved={missionFilesSaved}
          navigationReady={navigationReady}
          navigationRunning={navigationRunning}
          obstacleBoxes={obstacleBoxes}
          processConnection={processConnection}
          processError={processError}
          processExitCodes={processExitCodes}
          processLogs={processLogs}
          processPids={processPids}
          processStatuses={processStatuses}
          robotReady={robotReady}
          sprayCheckAccepted={sprayCheckAccepted}
          onRevealMissionFile={revealMissionFile}
          onSaveMissionFiles={saveMissionFiles}
          onSendRobotReady={sendRobotReady}
          onSprayCheckChange={setSprayCheckAccepted}
          onStartLocalization={() => startProcess("localization")}
          onStartNavigation={() => startProcess("navigation")}
          onStopLocalization={() => stopProcess("localization")}
          onStopNavigation={() => stopProcess("navigation")}
          onRemoveObstacle={removeObstacle}
        />
      </section>
    </main>
  );
}
