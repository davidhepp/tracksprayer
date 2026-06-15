import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import { TrackPreview } from "../components/TrackPreview";
import {
  DISCIPLINE_LABELS,
  GENERATED_DISCIPLINES,
  RULE_LIMITS,
  deleteTrack,
  exportTrackUrl,
  generateTrack,
  getTrack,
  listTracks,
  saveTrack,
  type Discipline,
  type ExportFormat,
  type GenerateRequest,
  type GenerationMode,
  type Track,
  type TrackSummary,
} from "../lib/tracksApi";
import type { Route } from "./+types/tracks";

const DISCIPLINES: Discipline[] = ["trackdrive", "autocross"];

const EXPORT_FORMATS: ExportFormat[] = ["fssim", "fsds", "gpx"];

const MODES: GenerationMode[] = ["random", "expand", "extend"];

const RANDOMISE_ATTEMPTS = 8;

type RandomisableParams = {
  trackWidth: number;
  nPoints: number;
  nRegions: number;
  maxBound: number;
  mode: GenerationMode;
  seed: number;
};

function randomInRange(min: number, max: number, step: number) {
  const steps = Math.floor((max - min) / step);
  const value = min + Math.floor(Math.random() * (steps + 1)) * step;
  return Math.round(value / step) * step;
}

function buildRandomParams(discipline: Discipline): RandomisableParams {
  const trackWidth = Number(randomInRange(3, 5, 0.1).toFixed(1));
  const nPoints = Math.round(randomInRange(25, 90, 1));
  const ratio = 0.3 + Math.random() * 0.3;
  const nRegions = Math.min(
    RULE_LIMITS.nRegions.max,
    Math.max(RULE_LIMITS.nRegions.min, Math.min(nPoints - 1, Math.round(nPoints * ratio))),
  );
  const boundRange =
    discipline === "autocross" ? { min: 140, max: 260 } : { min: 90, max: 160 };
  const maxBound = Math.round(
    randomInRange(boundRange.min, boundRange.max, RULE_LIMITS.maxBound.step),
  );
  const mode = MODES[Math.floor(Math.random() * MODES.length)];
  const seed = Math.floor(Math.random() * 2 ** 31);
  return { trackWidth, nPoints, nRegions, maxBound, mode, seed };
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "TrackSprayer Tracks" },
    {
      name: "description",
      content:
        "Generate, manage and export Formula Student Driverless tracks.",
    },
  ];
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function coneCount(track: Track) {
  return (
    track.cones_left.length +
    track.cones_right.length +
    track.cones_orange.length +
    track.cones_orange_big.length
  );
}

export default function Tracks() {
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [selected, setSelected] = useState<Track | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [discipline, setDiscipline] = useState<Discipline>("trackdrive");
  const [name, setName] = useState("");
  const [trackWidth, setTrackWidth] = useState<number>(
    RULE_LIMITS.trackWidth.default,
  );
  const [nPoints, setNPoints] = useState<number>(RULE_LIMITS.nPoints.default);
  const [nRegions, setNRegions] = useState<number>(RULE_LIMITS.nRegions.default);
  const [maxBound, setMaxBound] = useState<number>(RULE_LIMITS.maxBound.default);
  const [mode, setMode] = useState<GenerationMode>("random");
  const [seed, setSeed] = useState("");

  const isGeneratedDiscipline = GENERATED_DISCIPLINES.includes(discipline);

  const refreshList = useCallback(async () => {
    try {
      const list = await listTracks();
      setTracks(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracks.");
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleSelect = useCallback(async (id: string) => {
    setIsBusy(true);
    setError(null);
    try {
      const track = await getTrack(id);
      setSelected(track);
      setIsDraft(false);
      setStatus(`Loaded "${track.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load track.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleGenerate = async () => {
    setIsBusy(true);
    setError(null);
    setStatus(null);
    try {
      const request: GenerateRequest = { discipline };
      if (name.trim()) {
        request.name = name.trim();
      }
      if (isGeneratedDiscipline) {
        request.track_width = trackWidth;
        request.n_points = nPoints;
        request.n_regions = nRegions;
        request.max_bound = maxBound;
        request.mode = mode;
        if (seed.trim() !== "") {
          request.seed = Number(seed);
        }
      }
      const track = await generateTrack(request);
      setSelected(track);
      setIsDraft(true);
      setStatus(
        `Generated ${DISCIPLINE_LABELS[discipline]} preview (${coneCount(track)} cones). Not saved yet.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const applyRandomParams = (params: RandomisableParams) => {
    setTrackWidth(params.trackWidth);
    setNPoints(params.nPoints);
    setNRegions(params.nRegions);
    setMaxBound(params.maxBound);
    setMode(params.mode);
    setSeed(String(params.seed));
  };

  const handleRandomise = async () => {
    setIsBusy(true);
    setError(null);
    setStatus(null);
    let lastError: string | null = null;
    let lastParams: RandomisableParams | null = null;
    try {
      for (let attempt = 1; attempt <= RANDOMISE_ATTEMPTS; attempt += 1) {
        const params = buildRandomParams(discipline);
        lastParams = params;
        const request: GenerateRequest = {
          discipline,
          track_width: params.trackWidth,
          n_points: params.nPoints,
          n_regions: params.nRegions,
          max_bound: params.maxBound,
          mode: params.mode,
          seed: params.seed,
        };
        if (name.trim()) {
          request.name = name.trim();
        }
        try {
          const track = await generateTrack(request);
          applyRandomParams(params);
          setSelected(track);
          setIsDraft(true);
          setStatus(
            `Generated random ${DISCIPLINE_LABELS[discipline]} preview (${coneCount(track)} cones) on attempt ${attempt}. Not saved yet.`,
          );
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Generation failed.";
        }
      }
      if (lastParams) {
        applyRandomParams(lastParams);
      }
      setError(
        `Could not generate a rule-compliant track after ${RANDOMISE_ATTEMPTS} attempts.${
          lastError ? ` Last error: ${lastError}` : ""
        }`,
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    if (!selected) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      const saved = await saveTrack(selected);
      setSelected(saved);
      setIsDraft(false);
      setStatus(`Saved "${saved.name}".`);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (track: TrackSummary) => {
    if (track.isPreset) {
      return;
    }
    if (!window.confirm(`Delete track "${track.name}"? This cannot be undone.`)) {
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await deleteTrack(track.id);
      setStatus(`Deleted "${track.name}".`);
      if (selected?.id === track.id && !isDraft) {
        setSelected(null);
      }
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleExport = (format: ExportFormat) => {
    if (!selected || isDraft) {
      return;
    }
    const url = exportTrackUrl(selected.id, format);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const selectedConeCount = useMemo(
    () => (selected ? coneCount(selected) : 0),
    [selected],
  );

  return (
    <main className="operator-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Formula Student Driverless</p>
          <h1>Track Generation &amp; Management</h1>
        </div>
        <nav className="page-nav" aria-label="Primary">
          <Link to="/">Operator</Link>
          <Link to="/tracks" className="is-active" aria-current="page">
            Tracks
          </Link>
        </nav>
      </header>

      <section className="workspace tracks-workspace" aria-label="Track workspace">
        <aside className="control-panel" aria-label="Saved tracks">
          <section className="panel-section">
            <div className="section-heading">
              <p className="eyebrow">Library</p>
              <h2>Saved tracks</h2>
            </div>
            {tracks.length === 0 ? (
              <p className="empty-state">No tracks available yet.</p>
            ) : (
              <ul className="track-list">
                {tracks.map((track) => (
                  <li
                    key={track.id}
                    className={selected?.id === track.id ? "is-active" : ""}
                  >
                    <button
                      type="button"
                      className="track-list-select"
                      onClick={() => handleSelect(track.id)}
                    >
                      <span className="track-list-name">{track.name}</span>
                      <span className="track-list-meta">
                        <span className={`discipline-tag ${track.discipline}`}>
                          {DISCIPLINE_LABELS[track.discipline]}
                        </span>
                        {track.isPreset ? (
                          <span className="preset-badge">Preset</span>
                        ) : null}
                      </span>
                      <small>
                        {track.cone_count} cones · {formatDate(track.createdAt)}
                      </small>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={track.isPreset || isBusy}
                      title={
                        track.isPreset
                          ? "Presets are delete-protected"
                          : "Delete track"
                      }
                      aria-label={`Delete ${track.name}`}
                      onClick={() => handleDelete(track)}
                    >
                      x
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="map-section preview-section" aria-label="Track preview">
          <div className="preview-toolbar">
            <div>
              <p className="eyebrow">Preview</p>
              <h2>{selected ? selected.name : "No track selected"}</h2>
            </div>
            {selected && (
              <div className="preview-tags">
                <span className={`discipline-tag ${selected.discipline}`}>
                  {DISCIPLINE_LABELS[selected.discipline]}
                </span>
                {isDraft ? (
                  <span className="draft-badge">Unsaved</span>
                ) : selected.isPreset ? (
                  <span className="preset-badge">Preset</span>
                ) : null}
              </div>
            )}
          </div>

          <TrackPreview track={selected} />

          {selected && (
            <div className="preview-stats">
              <span>{selectedConeCount} cones</span>
              <span>L {selected.cones_left.length}</span>
              <span>R {selected.cones_right.length}</span>
              <span>Orange {selected.cones_orange.length}</span>
              <span>Big {selected.cones_orange_big.length}</span>
              {typeof selected.params.seed === "number" && (
                <span>Seed {selected.params.seed}</span>
              )}
            </div>
          )}

          <div className="preview-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!selected || !isDraft || isBusy}
              onClick={handleSave}
            >
              Save to library
            </button>
            <div className="export-group" role="group" aria-label="Export formats">
              {EXPORT_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  className="secondary-button small-button"
                  disabled={!selected || isDraft}
                  title={
                    isDraft
                      ? "Save the track before exporting"
                      : `Export ${format.toUpperCase()}`
                  }
                  onClick={() => handleExport(format)}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          {isDraft && (
            <p className="helper-text">
              Save the generated track to enable FSSIM / FSDS / GPX export.
            </p>
          )}
        </section>

        <aside className="control-panel" aria-label="Track generation">
          <section className="panel-section">
            <div className="section-heading">
              <p className="eyebrow">Generator</p>
              <h2>New track</h2>
            </div>

            <label className="field-control">
              <span>Discipline</span>
              <select
                value={discipline}
                onChange={(event) =>
                  setDiscipline(event.target.value as Discipline)
                }
              >
                {DISCIPLINES.map((value) => (
                  <option key={value} value={value}>
                    {DISCIPLINE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-control">
              <span>Name (optional)</span>
              <input
                type="text"
                placeholder={DISCIPLINE_LABELS[discipline]}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>

            {isGeneratedDiscipline ? (
              <>
                <RangeField
                  label="Track width"
                  unit="m"
                  min={RULE_LIMITS.trackWidth.min}
                  max={RULE_LIMITS.trackWidth.max}
                  step={RULE_LIMITS.trackWidth.step}
                  value={trackWidth}
                  onChange={setTrackWidth}
                />
                <RangeField
                  label="Voronoi points"
                  min={RULE_LIMITS.nPoints.min}
                  max={RULE_LIMITS.nPoints.max}
                  step={RULE_LIMITS.nPoints.step}
                  value={nPoints}
                  onChange={setNPoints}
                />
                <RangeField
                  label="Regions"
                  min={RULE_LIMITS.nRegions.min}
                  max={RULE_LIMITS.nRegions.max}
                  step={RULE_LIMITS.nRegions.step}
                  value={nRegions}
                  onChange={setNRegions}
                />
                <RangeField
                  label="Area size"
                  unit="m"
                  min={RULE_LIMITS.maxBound.min}
                  max={RULE_LIMITS.maxBound.max}
                  step={RULE_LIMITS.maxBound.step}
                  value={maxBound}
                  onChange={setMaxBound}
                />
                <label className="field-control">
                  <span>Shape mode</span>
                  <select
                    value={mode}
                    onChange={(event) =>
                      setMode(event.target.value as GenerationMode)
                    }
                  >
                    {MODES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-control">
                  <span>Seed (optional)</span>
                  <input
                    type="number"
                    placeholder="random"
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                  />
                </label>
                <p className="helper-text">
                  Rule limits enforced: min radius 4.5 m, straights ≤ 80 m, lap
                  200–500 m, cone spacing ≤ 5 m.
                </p>
              </>
            ) : (
              <p className="helper-text">
                {DISCIPLINE_LABELS[discipline]} uses fixed, rule-compliant
                geometry and is generated deterministically.
              </p>
            )}

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={isBusy}
                onClick={handleGenerate}
              >
                {isBusy ? "Working…" : "Generate"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isBusy}
                onClick={handleRandomise}
              >
                {isBusy ? "Working…" : "Randomise"}
              </button>
            </div>
          </section>

          {(status || error) && (
            <section className="panel-section">
              {error ? (
                <p className="process-error" role="status">
                  {error}
                </p>
              ) : (
                <p className="status-banner" role="status">
                  {status}
                </p>
              )}
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function RangeField({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>
        {value}
        {unit ? ` ${unit}` : ""}
      </strong>
    </label>
  );
}
