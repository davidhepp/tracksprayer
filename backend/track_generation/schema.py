"""Pydantic models and Formula Student rule limits shared across the backend.

The internal track document mirrors the FSSIM track layout (cones_left,
cones_right, cones_orange, cones_orange_big, starting_pose, tk_device) so the
FSSIM export is a near 1:1 dump, and adds the metadata required by the
frontend. Coordinates are in meters as lists of [x, y].
"""

from typing import Literal

from pydantic import BaseModel, Field

Discipline = Literal[
    "ebs_test",
    "trackdrive",
    "autocross",
]

DISCIPLINES: tuple[Discipline, ...] = (
    "ebs_test",
    "trackdrive",
    "autocross",
)

DETERMINISTIC_DISCIPLINES: tuple[Discipline, ...] = ("ebs_test",)

GENERATED_DISCIPLINES: tuple[Discipline, ...] = (
    "trackdrive",
    "autocross",
)

# Preset ids that ship with the app and must never be deleted.
PROTECTED_PRESET_IDS: tuple[str, ...] = ("ebs_test",)

# Formula Student Driverless 2025/2026 rule limits.
MIN_TRACK_WIDTH_M = 3.0
MIN_TURN_RADIUS_M = 4.5
CURVATURE_THRESHOLD = 1.0 / MIN_TURN_RADIUS_M
MAX_STRAIGHT_M = 80.0
MIN_LAP_LENGTH_M = 200.0
MAX_LAP_LENGTH_M = 500.0
MAX_CONE_SPACING_M = 5.0

Point2D = list[float]


class TrackGeometry(BaseModel):
    cones_left: list[Point2D] = Field(default_factory=list)
    cones_right: list[Point2D] = Field(default_factory=list)
    cones_orange: list[Point2D] = Field(default_factory=list)
    cones_orange_big: list[Point2D] = Field(default_factory=list)
    starting_pose: Point2D = Field(default_factory=lambda: [0.0, 0.0, 0.0])
    tk_device: list[Point2D] = Field(default_factory=list)


class Track(TrackGeometry):
    id: str
    name: str
    discipline: Discipline
    isPreset: bool = False
    params: dict = Field(default_factory=dict)
    createdAt: str


class TrackSummary(BaseModel):
    id: str
    name: str
    discipline: Discipline
    isPreset: bool
    createdAt: str
    cone_count: int


class GenerateRequest(BaseModel):
    discipline: Discipline
    name: str | None = None
    seed: int | None = None

    # Voronoi parameters (trackdrive / autocross only).
    track_width: float = Field(
        default=3.0, ge=MIN_TRACK_WIDTH_M, le=6.0
    )
    n_points: int = Field(default=30, ge=10, le=120)
    n_regions: int = Field(default=12, ge=3, le=50)
    min_bound: float = Field(default=0.0, ge=0.0, le=100.0)
    max_bound: float = Field(default=120.0, ge=50.0, le=300.0)
    mode: Literal["expand", "extend", "random"] = "random"


class SaveTrackRequest(Track):
    pass
