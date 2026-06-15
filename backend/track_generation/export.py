"""On-demand conversion of a stored track to FSSIM (YAML), FSDS (CSV) or GPX."""

from __future__ import annotations

import math

import gpxpy
import gpxpy.gpx
import yaml

from .schema import Track

EXPORT_FORMATS = ("fssim", "fsds", "gpx")

EARTH_RADIUS_M = 6378100.0


def export_fssim(track: Track) -> str:
    document = {
        "cones_left": [[float(x), float(y)] for x, y in track.cones_left],
        "cones_right": [[float(x), float(y)] for x, y in track.cones_right],
        "cones_orange": [[float(x), float(y)] for x, y in track.cones_orange],
        "cones_orange_big": [[float(x), float(y)] for x, y in track.cones_orange_big],
        "starting_pose_front_wing": [float(v) for v in track.starting_pose],
        "tk_device": [[float(x), float(y)] for x, y in track.tk_device],
    }
    return yaml.safe_dump(document, default_flow_style=None, sort_keys=False)


def export_fsds(track: Track) -> str:
    lines = ["tag,x,y,direction,x_variance,y_variance,xy_covariance"]

    def _rows(cones, tag):
        for x, y in cones:
            lines.append(f"{tag},{float(x)},{float(y)},0,0.01,0.01,0")

    _rows(track.cones_left, "blue")
    _rows(track.cones_right, "yellow")
    _rows(track.cones_orange, "orange")
    _rows(track.cones_orange_big, "big_orange")
    return "\n".join(lines) + "\n"


def export_gpx(
    track: Track,
    lat_offset: float = 0.0,
    lon_offset: float = 0.0,
    z_offset: float = 0.0,
) -> str:
    gpx = gpxpy.gpx.GPX()

    deg_per_m_lat = math.degrees(1.0 / EARTH_RADIUS_M)
    cos_lat = math.cos(math.radians(lat_offset)) or 1e-9
    deg_per_m_lon = math.degrees(1.0 / EARTH_RADIUS_M) / cos_lat

    def _waypoint(x, y, name, symbol):
        lat = lat_offset + float(y) * deg_per_m_lat
        lon = lon_offset + float(x) * deg_per_m_lon
        gpx.waypoints.append(
            gpxpy.gpx.GPXWaypoint(
                latitude=lat,
                longitude=lon,
                elevation=z_offset,
                name=name,
                symbol=symbol,
            )
        )

    for i, (x, y) in enumerate(track.cones_left):
        _waypoint(x, y, f"left_{i}", "blue")
    for i, (x, y) in enumerate(track.cones_right):
        _waypoint(x, y, f"right_{i}", "yellow")
    for i, (x, y) in enumerate(track.cones_orange):
        _waypoint(x, y, f"orange_{i}", "orange")
    for i, (x, y) in enumerate(track.cones_orange_big):
        _waypoint(x, y, f"orange_big_{i}", "big_orange")

    return gpx.to_xml()


def export_track(
    track: Track,
    fmt: str,
    lat_offset: float = 0.0,
    lon_offset: float = 0.0,
    z_offset: float = 0.0,
) -> tuple[str, str, str]:
    """Returns (content, media_type, filename)."""
    fmt = fmt.lower()
    if fmt == "fssim":
        return export_fssim(track), "application/x-yaml", f"{track.id}.yaml"
    if fmt == "fsds":
        return export_fsds(track), "text/csv", f"{track.id}.csv"
    if fmt == "gpx":
        return (
            export_gpx(track, lat_offset, lon_offset, z_offset),
            "application/gpx+xml",
            f"{track.id}.gpx",
        )
    raise ValueError(f"Unknown export format '{fmt}'. Expected one of {EXPORT_FORMATS}.")
