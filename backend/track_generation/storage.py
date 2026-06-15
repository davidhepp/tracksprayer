"""File-based track persistence: one JSON document per track.

  * presets/   -> shipped, delete-protected defaults (tracked in git)
  * generated/ -> user generated tracks (git-ignored, folder kept via .gitkeep)
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from settings import BACKEND_DIR

from .schema import PROTECTED_PRESET_IDS, Track, TrackSummary

TRACKS_DIR = BACKEND_DIR / "tracks"
PRESETS_DIR = TRACKS_DIR / "presets"
GENERATED_DIR = TRACKS_DIR / "generated"


class TrackStorageError(Exception):
    pass


class PresetProtectedError(TrackStorageError):
    """Raised when a delete is attempted on a protected preset."""


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "track"


class TrackStorage:
    def __init__(self, presets_dir: Path = PRESETS_DIR, generated_dir: Path = GENERATED_DIR) -> None:
        self.presets_dir = presets_dir
        self.generated_dir = generated_dir

    def _ensure_dirs(self) -> None:
        self.presets_dir.mkdir(parents=True, exist_ok=True)
        self.generated_dir.mkdir(parents=True, exist_ok=True)

    def _iter_files(self) -> list[tuple[Path, bool]]:
        self._ensure_dirs()
        files: list[tuple[Path, bool]] = []
        for path in sorted(self.presets_dir.glob("*.json")):
            files.append((path, True))
        for path in sorted(self.generated_dir.glob("*.json")):
            files.append((path, False))
        return files

    def _read(self, path: Path, is_preset: bool) -> Track:
        data = json.loads(path.read_text(encoding="utf-8"))
        data["isPreset"] = is_preset
        return Track.model_validate(data)

    def list_tracks(self) -> list[TrackSummary]:
        summaries: list[TrackSummary] = []
        for path, is_preset in self._iter_files():
            try:
                track = self._read(path, is_preset)
            except Exception:
                continue
            cone_count = (
                len(track.cones_left)
                + len(track.cones_right)
                + len(track.cones_orange)
                + len(track.cones_orange_big)
            )
            summaries.append(
                TrackSummary(
                    id=track.id,
                    name=track.name,
                    discipline=track.discipline,
                    isPreset=track.isPreset,
                    createdAt=track.createdAt,
                    cone_count=cone_count,
                )
            )
        return summaries

    def _find_path(self, track_id: str) -> tuple[Path, bool] | None:
        preset_path = self.presets_dir / f"{track_id}.json"
        if preset_path.exists():
            return preset_path, True
        generated_path = self.generated_dir / f"{track_id}.json"
        if generated_path.exists():
            return generated_path, False
        return None

    def get_track(self, track_id: str) -> Track | None:
        found = self._find_path(track_id)
        if found is None:
            return None
        path, is_preset = found
        return self._read(path, is_preset)

    def is_preset(self, track_id: str) -> bool:
        found = self._find_path(track_id)
        return bool(found and found[1])

    def _unique_generated_id(self, base: str) -> str:
        candidate = base
        suffix = 1
        while (self.generated_dir / f"{candidate}.json").exists() or (
            self.presets_dir / f"{candidate}.json"
        ).exists():
            suffix += 1
            candidate = f"{base}-{suffix}"
        return candidate

    def save_track(self, track: Track) -> Track:
        self._ensure_dirs()
        track.isPreset = False

        existing = self.generated_dir / f"{track.id}.json"
        if not track.id or (self.presets_dir / f"{track.id}.json").exists() or not existing.exists():
            base = slugify(track.id) if track.id else slugify(track.name)
            base = f"{base}-{uuid.uuid4().hex[:8]}"
            track.id = self._unique_generated_id(base)

        path = self.generated_dir / f"{track.id}.json"
        path.write_text(
            json.dumps(track.model_dump(), indent=2) + "\n", encoding="utf-8"
        )
        return track

    def delete_track(self, track_id: str) -> None:
        if track_id in PROTECTED_PRESET_IDS:
            raise PresetProtectedError(f"Preset '{track_id}' is delete-protected.")
        found = self._find_path(track_id)
        if found is None:
            raise TrackStorageError(f"Track '{track_id}' not found.")
        path, is_preset = found
        if is_preset:
            raise PresetProtectedError(f"Preset '{track_id}' is delete-protected.")
        path.unlink()


track_storage = TrackStorage()
