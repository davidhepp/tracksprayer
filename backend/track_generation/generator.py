"""Track geometry generation.

Deterministic disciplines (skidpad / acceleration / ebs_test) are built from
fixed, rule-compliant geometry. Trackdrive / autocross use a bounded-Voronoi
generator adapted from https://github.com/mvanlobensels/random-track-generator
(MIT) with Formula Student 2025/2026 rule limits enforced:
  * minimum turn radius 4.5 m -> CURVATURE_THRESHOLD = 1/4.5
  * generated laps validated to 200-500 m with straights <= 80 m
  * cone spacing curvature dependent and always <= 5 m
"""

from __future__ import annotations

import math

import numpy as np
from scipy import interpolate, signal, spatial
from shapely.geometry import LineString, Point, Polygon

from .schema import (
    CURVATURE_THRESHOLD,
    MAX_LAP_LENGTH_M,
    MAX_STRAIGHT_M,
    MIN_LAP_LENGTH_M,
    TrackGeometry,
)

STRAIGHT_CURVATURE_THRESHOLD = 1.0 / 100.0
SPACING_STRAIGHT_M = 4.5
SPACING_CURVE_M = 2.5
MAX_GENERATION_ATTEMPTS = 400


class TrackGenerationError(Exception):
    """Raised when no rule-compliant track could be generated."""


# --------------------------------------------------------------------------- #
# Deterministic disciplines
# --------------------------------------------------------------------------- #

def _circle_cones(center: tuple[float, float], radius: float, angles_deg) -> list[list[float]]:
    cx, cy = center
    cones = []
    for a in angles_deg:
        rad = math.radians(a)
        cones.append([round(cx + radius * math.cos(rad), 4), round(cy + radius * math.sin(rad), 4)])
    return cones


def build_skidpad() -> TrackGeometry:
    """Standard FS skidpad (figure-of-eight), deterministic.

    Inner circle diameter 15.25 m, outer 21.25 m (3 m lane), circle centers
    18.25 m apart, 16 inner + 13 outer cones per circle.
    """
    inner_r = 15.25 / 2
    outer_r = 21.25 / 2
    half_offset = 18.25 / 2
    top = (0.0, half_offset)
    bottom = (0.0, -half_offset)

    inner_top = _circle_cones(top, inner_r, [-90 + 22.5 * k for k in range(16)])
    inner_bottom = _circle_cones(bottom, inner_r, [90 + 22.5 * k for k in range(16)])
    outer_top = _circle_cones(top, outer_r, [-45 + 22.5 * k for k in range(13)])
    outer_bottom = _circle_cones(bottom, outer_r, [135 + 22.5 * k for k in range(13)])

    cones_right = inner_top + outer_bottom
    cones_left = outer_top + inner_bottom

    cones_orange = []
    for x in (11.0, 15.0, 19.0):
        for sx in (-1.0, 1.0):
            for sy in (-1.65, 1.65):
                cones_orange.append([round(sx * x, 4), sy])

    cones_orange_big = [[-1.3, 2.0], [-1.3, -2.0], [1.3, 2.0], [1.3, -2.0]]

    return TrackGeometry(
        cones_left=cones_left,
        cones_right=cones_right,
        cones_orange=cones_orange,
        cones_orange_big=cones_orange_big,
        starting_pose=[-15.0, 0.0, 0.0],
        tk_device=[[0.0, 2.0], [0.0, -2.0]],
    )


def _straight_track(length: float, width: float, spacing: float = 5.0) -> TrackGeometry:
    half_w = width / 2
    xs = list(np.arange(spacing, length, spacing))
    cones_left = [[round(x, 4), round(half_w, 4)] for x in xs]
    cones_right = [[round(x, 4), round(-half_w, 4)] for x in xs]
    cones_orange_big = [
        [0.0, round(half_w, 4)],
        [0.0, round(-half_w, 4)],
        [round(length, 4), round(half_w, 4)],
        [round(length, 4), round(-half_w, 4)],
    ]
    return TrackGeometry(
        cones_left=cones_left,
        cones_right=cones_right,
        cones_orange=[],
        cones_orange_big=cones_orange_big,
        starting_pose=[-5.0, 0.0, 0.0],
        tk_device=[
            [0.0, round(half_w, 4)],
            [0.0, round(-half_w, 4)],
            [round(length, 4), round(half_w, 4)],
            [round(length, 4), round(-half_w, 4)],
        ],
    )


def build_acceleration() -> TrackGeometry:
    """FS acceleration: 75 m straight, 3 m wide, cones ~5 m, big orange at ends."""
    return _straight_track(length=75.0, width=3.0, spacing=5.0)


def build_ebs_test() -> TrackGeometry:
    """FS EBS test: short braking straight, deterministic."""
    return _straight_track(length=30.0, width=3.0, spacing=5.0)


# --------------------------------------------------------------------------- #
# Voronoi generator (trackdrive / autocross)
# --------------------------------------------------------------------------- #

def _closest_node(node: np.ndarray, nodes: np.ndarray, k: int) -> int:
    deltas = nodes - node
    distance = np.einsum("ij,ij->i", deltas, deltas)
    return int(np.argpartition(distance, k)[k])


def _clockwise_sort(p: np.ndarray) -> np.ndarray:
    d = p - np.mean(p, axis=0)
    s = np.arctan2(d[:, 0], d[:, 1])
    return p[np.argsort(s), :]


def _curvature(dx_dt, d2x_dt2, dy_dt, d2y_dt2) -> np.ndarray:
    return (dx_dt**2 + dy_dt**2) ** -1.5 * (dx_dt * d2y_dt2 - dy_dt * d2x_dt2)


def _bounded_voronoi(input_points: np.ndarray, bounding_box: np.ndarray) -> spatial.Voronoi:
    def _mirror(boundary: float, axis: int) -> np.ndarray:
        mirrored = np.copy(points_center)
        mirrored[:, axis] = 2 * boundary - mirrored[:, axis]
        return mirrored

    x_min, x_max, y_min, y_max = bounding_box
    points_center = input_points
    points = np.concatenate(
        [
            points_center,
            _mirror(x_min, axis=0),
            _mirror(x_max, axis=0),
            _mirror(y_min, axis=1),
            _mirror(y_max, axis=1),
        ]
    )
    return spatial.Voronoi(points)


def _centerline_from_voronoi(
    n_points: int,
    n_regions: int,
    min_bound: float,
    max_bound: float,
    mode: str,
    rng: np.random.Generator,
) -> np.ndarray:
    """Returns sampled centerline coordinates (N, 2) of a smooth closed loop."""
    input_points = rng.uniform(min_bound, max_bound, (n_points, 2))
    bounding_box = np.array([min_bound, max_bound, min_bound, max_bound])
    vor = _bounded_voronoi(input_points, bounding_box)

    if mode == "expand":
        random_index = int(rng.integers(0, n_points))
        random_point_indices = [random_index]
        random_point = input_points[random_index]
        for i in range(n_regions - 1):
            random_point_indices.append(_closest_node(random_point, input_points, k=i + 1))
    elif mode == "extend":
        random_index = int(rng.integers(0, n_points))
        random_heading = rng.uniform(0, np.pi / 2)
        random_point = input_points[random_index]
        start = (
            random_point[0] - 0.5 * max_bound * np.cos(random_heading),
            random_point[1] - 0.5 * max_bound * np.sin(random_heading),
        )
        end = (
            random_point[0] + 0.5 * max_bound * np.cos(random_heading),
            random_point[1] + 0.5 * max_bound * np.sin(random_heading),
        )
        line = LineString([start, end])
        distances = [Point(p).distance(line) for p in input_points]
        random_point_indices = np.argpartition(distances, n_regions)[:n_regions]
    else:  # random
        random_point_indices = rng.integers(0, n_points, n_regions)

    regions = np.array([np.array(region) for region in vor.regions], dtype=object)
    random_region_indices = vor.point_region[random_point_indices]
    random_regions = np.concatenate(regions[random_region_indices])
    random_vertices = np.unique(vor.vertices[random_regions], axis=0)

    sorted_vertices = _clockwise_sort(random_vertices)
    sorted_vertices = np.vstack([sorted_vertices, sorted_vertices[0]])

    if len(sorted_vertices) < 5:
        raise TrackGenerationError("Not enough Voronoi vertices for interpolation.")

    while True:
        tck, _ = interpolate.splprep(
            [sorted_vertices[:, 0], sorted_vertices[:, 1]], s=0, per=True
        )
        t = np.linspace(0, 1, 1000)
        x, y = interpolate.splev(t, tck, der=0)
        dx_dt, dy_dt = interpolate.splev(t, tck, der=1)
        d2x_dt2, d2y_dt2 = interpolate.splev(t, tck, der=2)

        abs_curvature = np.abs(_curvature(dx_dt, d2x_dt2, dy_dt, d2y_dt2))
        peaks, _ = signal.find_peaks(abs_curvature)
        if len(peaks) == 0:
            break
        max_peak_index = abs_curvature[peaks].argmax()
        if abs_curvature[peaks][max_peak_index] <= CURVATURE_THRESHOLD:
            break

        max_peak = peaks[max_peak_index]
        vertice = _closest_node((x[max_peak], y[max_peak]), sorted_vertices, k=0)
        sorted_vertices = np.delete(sorted_vertices, vertice, axis=0)
        if len(sorted_vertices) < 5:
            raise TrackGenerationError("Too few vertices left after curvature reduction.")
        if not np.array_equal(sorted_vertices[0], sorted_vertices[-1]):
            sorted_vertices = np.vstack([sorted_vertices, sorted_vertices[0]])

    track = Polygon(zip(x, y))
    if not track.is_valid or track.geom_type != "Polygon":
        raise TrackGenerationError("Generated centerline is self-intersecting.")

    return np.column_stack([x, y])


def _resample_arc_length(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    diffs = np.diff(points, axis=0)
    seg_len = np.hypot(diffs[:, 0], diffs[:, 1])
    cumulative = np.concatenate([[0.0], np.cumsum(seg_len)])
    return cumulative, seg_len, float(cumulative[-1])


def _menger_curvature(points: np.ndarray, cumulative: np.ndarray) -> np.ndarray:
    n = len(points)
    k = np.zeros(n)
    for i in range(n):
        a = points[(i - 1) % n]
        b = points[i]
        c = points[(i + 1) % n]
        ab = np.hypot(*(b - a))
        bc = np.hypot(*(c - b))
        ca = np.hypot(*(a - c))
        area2 = abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
        denom = ab * bc * ca
        k[i] = 0.0 if denom == 0 else 2 * area2 / denom
    return k


def _max_straight_length(seg_len: np.ndarray, curvature: np.ndarray) -> float:
    straight = curvature[:-1] <= STRAIGHT_CURVATURE_THRESHOLD
    best = 0.0
    run = 0.0
    for is_straight, length in zip(straight, seg_len):
        if is_straight:
            run += length
            best = max(best, run)
        else:
            run = 0.0
    return best


def _spacing_for_curvature(k: float) -> float:
    t = min(abs(k) / CURVATURE_THRESHOLD, 1.0)
    return SPACING_STRAIGHT_M + (SPACING_CURVE_M - SPACING_STRAIGHT_M) * t


def _place_cones(
    points: np.ndarray, cumulative: np.ndarray, total: float, curvature: np.ndarray, width: float
) -> tuple[list, list]:
    x = points[:, 0]
    y = points[:, 1]
    half_w = width / 2
    cones_left: list[list[float]] = []
    cones_right: list[list[float]] = []

    s = 0.0
    while s < total:
        px = float(np.interp(s, cumulative, x))
        py = float(np.interp(s, cumulative, y))
        ds = max(total * 1e-4, 0.05)
        s2 = (s + ds) % total
        nx = float(np.interp(s2, cumulative, x))
        ny = float(np.interp(s2, cumulative, y))
        tx, ty = nx - px, ny - py
        norm = math.hypot(tx, ty)
        if norm == 0:
            s += SPACING_STRAIGHT_M
            continue
        tx, ty = tx / norm, ty / norm
        left_n = (-ty, tx)
        k = float(np.interp(s, cumulative, curvature))

        cones_left.append([round(px + left_n[0] * half_w, 4), round(py + left_n[1] * half_w, 4)])
        cones_right.append([round(px - left_n[0] * half_w, 4), round(py - left_n[1] * half_w, 4)])
        s += _spacing_for_curvature(k)

    return cones_left, cones_right


def _transform_to_start(geometry_points: list[list[float]], origin: np.ndarray, heading: float) -> list[list[float]]:
    c, s = math.cos(-heading), math.sin(-heading)
    out = []
    for px, py in geometry_points:
        dx, dy = px - origin[0], py - origin[1]
        rx = dx * c - dy * s
        ry = dx * s + dy * c
        out.append([round(rx, 4), round(ry, 4)])
    return out


def _generate_loop(
    n_points: int,
    n_regions: int,
    min_bound: float,
    max_bound: float,
    mode: str,
    width: float,
    rng: np.random.Generator,
) -> TrackGeometry:
    centerline = _centerline_from_voronoi(n_points, n_regions, min_bound, max_bound, mode, rng)
    cumulative, seg_len, total = _resample_arc_length(centerline)

    if not (MIN_LAP_LENGTH_M <= total <= MAX_LAP_LENGTH_M):
        raise TrackGenerationError(f"Lap length {total:.1f} m outside 200-500 m.")

    curvature = _menger_curvature(centerline, cumulative)
    if curvature.max() > CURVATURE_THRESHOLD + 1e-6:
        raise TrackGenerationError("Curvature exceeds minimum radius after resampling.")

    max_straight = _max_straight_length(seg_len, curvature)
    if max_straight > MAX_STRAIGHT_M:
        raise TrackGenerationError(f"Straight {max_straight:.1f} m exceeds 80 m.")

    # Start pose at the beginning of the longest straight.
    straight = curvature[:-1] <= STRAIGHT_CURVATURE_THRESHOLD
    start_idx = 0
    best = run = 0.0
    run_start = 0
    for i, (is_straight, length) in enumerate(zip(straight, seg_len)):
        if is_straight:
            if run == 0.0:
                run_start = i
            run += length
            if run > best:
                best = run
                start_idx = run_start
        else:
            run = 0.0

    origin = centerline[start_idx]
    nxt = centerline[(start_idx + 1) % len(centerline)]
    heading = math.atan2(nxt[1] - origin[1], nxt[0] - origin[0])

    cones_left, cones_right = _place_cones(centerline, cumulative, total, curvature, width)
    cones_left = _transform_to_start(cones_left, origin, heading)
    cones_right = _transform_to_start(cones_right, origin, heading)

    half_w = width / 2
    cones_orange_big = [[0.0, round(half_w, 4)], [0.0, round(-half_w, 4)]]
    tk_device = [[0.0, round(half_w, 4)], [0.0, round(-half_w, 4)]]

    return TrackGeometry(
        cones_left=cones_left,
        cones_right=cones_right,
        cones_orange=[],
        cones_orange_big=cones_orange_big,
        starting_pose=[0.0, 0.0, 0.0],
        tk_device=tk_device,
    )


def generate_voronoi_track(
    n_points: int,
    n_regions: int,
    min_bound: float,
    max_bound: float,
    mode: str,
    width: float,
    seed: int | None,
) -> tuple[TrackGeometry, int]:
    """Generates a rule-compliant track, retrying with derived seeds.

    Returns the geometry and the seed that produced it.
    """
    base_seed = seed if seed is not None else int(np.random.SeedSequence().entropy % (2**32))
    for attempt in range(MAX_GENERATION_ATTEMPTS):
        attempt_seed = (base_seed + attempt) % (2**32)
        rng = np.random.default_rng(attempt_seed)
        try:
            geometry = _generate_loop(
                n_points, n_regions, min_bound, max_bound, mode, width, rng
            )
        except TrackGenerationError:
            continue
        except Exception:
            continue
        return geometry, attempt_seed

    raise TrackGenerationError(
        "Could not generate a rule-compliant track. Try a larger max_bound or "
        "different parameters."
    )
