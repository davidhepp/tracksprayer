export const BACKEND_HTTP_BASE_URL =
  import.meta.env.VITE_ROBOT_BACKEND_URL ?? "http://localhost:8000";

export type Discipline =
  | "ebs_test"
  | "trackdrive"
  | "autocross";

export type GenerationMode = "expand" | "extend" | "random";

export type ExportFormat = "fssim" | "fsds" | "gpx";

export type TrackGeometry = {
  cones_left: number[][];
  cones_right: number[][];
  cones_orange: number[][];
  cones_orange_big: number[][];
  starting_pose: number[];
  tk_device: number[][];
};

export type Track = TrackGeometry & {
  id: string;
  name: string;
  discipline: Discipline;
  isPreset: boolean;
  params: Record<string, unknown>;
  createdAt: string;
};

export type TrackSummary = {
  id: string;
  name: string;
  discipline: Discipline;
  isPreset: boolean;
  createdAt: string;
  cone_count: number;
};

export type GenerateRequest = {
  discipline: Discipline;
  name?: string;
  seed?: number | null;
  track_width?: number;
  n_points?: number;
  n_regions?: number;
  min_bound?: number;
  max_bound?: number;
  mode?: GenerationMode;
};

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  ebs_test: "EBS Test",
  trackdrive: "Trackdrive",
  autocross: "Autocross",
};

export const GENERATED_DISCIPLINES: Discipline[] = ["trackdrive", "autocross"];

export const RULE_LIMITS = {
  trackWidth: { min: 3, max: 6, step: 0.1, default: 3 },
  nPoints: { min: 10, max: 120, step: 1, default: 30 },
  nRegions: { min: 3, max: 50, step: 1, default: 12 },
  maxBound: { min: 50, max: 300, step: 5, default: 120 },
} as const;

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) =>
          item && typeof item === "object" && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : JSON.stringify(item),
        )
        .join(", ");
    }
  } catch {
    // fall through to status text
  }
  return `${response.status} ${response.statusText}`;
}

export async function listTracks(): Promise<TrackSummary[]> {
  const response = await fetch(`${BACKEND_HTTP_BASE_URL}/tracks`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as TrackSummary[];
}

export async function getTrack(id: string): Promise<Track> {
  const response = await fetch(`${BACKEND_HTTP_BASE_URL}/tracks/${id}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Track;
}

export async function generateTrack(request: GenerateRequest): Promise<Track> {
  const response = await fetch(`${BACKEND_HTTP_BASE_URL}/tracks/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Track;
}

export async function saveTrack(track: Track): Promise<Track> {
  const response = await fetch(`${BACKEND_HTTP_BASE_URL}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(track),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Track;
}

export async function deleteTrack(id: string): Promise<void> {
  const response = await fetch(`${BACKEND_HTTP_BASE_URL}/tracks/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export function exportTrackUrl(id: string, format: ExportFormat): string {
  return `${BACKEND_HTTP_BASE_URL}/tracks/${id}/export?format=${format}`;
}
