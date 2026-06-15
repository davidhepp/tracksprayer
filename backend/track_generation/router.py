"""FastAPI routes for track generation, storage and export."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from .export import export_track
from .generator import (
    TrackGenerationError,
    build_acceleration,
    build_ebs_test,
    build_skidpad,
    generate_voronoi_track,
)
from .schema import (
    GENERATED_DISCIPLINES,
    GenerateRequest,
    SaveTrackRequest,
    Track,
    TrackGeometry,
    TrackSummary,
)
from .storage import PresetProtectedError, TrackStorageError, slugify, track_storage

router = APIRouter(prefix="/tracks", tags=["tracks"])

DISCIPLINE_LABELS = {
    "skidpad": "Skidpad",
    "acceleration": "Acceleration",
    "ebs_test": "EBS Test",
    "trackdrive": "Trackdrive",
    "autocross": "Autocross",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("")
def list_tracks() -> list[TrackSummary]:
    return track_storage.list_tracks()


@router.get("/{track_id}")
def get_track(track_id: str) -> Track:
    track = track_storage.get_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found.")
    return track


@router.post("/generate")
def generate_track(request: GenerateRequest) -> Track:
    discipline = request.discipline
    params: dict = {"seed": request.seed}

    if discipline == "skidpad":
        geometry = build_skidpad()
    elif discipline == "acceleration":
        geometry = build_acceleration()
    elif discipline == "ebs_test":
        geometry = build_ebs_test()
    elif discipline in GENERATED_DISCIPLINES:
        try:
            geometry, used_seed = generate_voronoi_track(
                n_points=request.n_points,
                n_regions=request.n_regions,
                min_bound=request.min_bound,
                max_bound=request.max_bound,
                mode=request.mode,
                width=request.track_width,
                seed=request.seed,
            )
        except TrackGenerationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        params = {
            "seed": used_seed,
            "n_points": request.n_points,
            "n_regions": request.n_regions,
            "min_bound": request.min_bound,
            "max_bound": request.max_bound,
            "mode": request.mode,
            "track_width": request.track_width,
        }
    else:  # pragma: no cover - guarded by pydantic Literal
        raise HTTPException(status_code=400, detail=f"Unknown discipline '{discipline}'.")

    name = request.name or DISCIPLINE_LABELS.get(discipline, discipline)
    track = Track(
        id=slugify(name),
        name=name,
        discipline=discipline,
        isPreset=False,
        params=params,
        createdAt=_now_iso(),
        **geometry.model_dump(),
    )
    return track


@router.post("")
def save_track(request: SaveTrackRequest) -> Track:
    if not request.createdAt:
        request.createdAt = _now_iso()
    saved = track_storage.save_track(Track.model_validate(request.model_dump()))
    return saved


@router.delete("/{track_id}")
def delete_track(track_id: str) -> dict[str, bool | str]:
    try:
        track_storage.delete_track(track_id)
    except PresetProtectedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except TrackStorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "id": track_id}


@router.get("/{track_id}/export")
def export_track_endpoint(
    track_id: str,
    format: str = Query(..., pattern="^(fssim|fsds|gpx)$"),
    lat_offset: float = Query(default=51.197, description="GPX latitude origin in degrees."),
    lon_offset: float = Query(default=5.323, description="GPX longitude origin in degrees."),
    z_offset: float = Query(default=0.0, description="GPX altitude offset in meters."),
) -> Response:
    track = track_storage.get_track(track_id)
    if track is None:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found.")

    try:
        content, media_type, filename = export_track(
            track, format, lat_offset, lon_offset, z_offset
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
