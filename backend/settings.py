import os
from dataclasses import dataclass
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class ProcessDefinition:
    name: str
    script_path: Path
    working_directory: Path


def _path_from_env(name: str, fallback: Path) -> Path:
    return Path(os.getenv(name, str(fallback))).expanduser().resolve()


def _float_from_env(name: str, fallback: float) -> float:
    try:
        return float(os.getenv(name, str(fallback)))
    except ValueError:
        return fallback


SHARED_FILES_DIR = _path_from_env(
    "TRACKSPRAYER_SHARED_DIR",
    BACKEND_DIR / "shared_files",
)
WAYPOINTS_FILE = _path_from_env(
    "TRACKSPRAYER_WAYPOINTS_FILE",
    SHARED_FILES_DIR / "waypoints.json",
)
OBSTACLES_FILE = _path_from_env(
    "TRACKSPRAYER_OBSTACLES_FILE",
    SHARED_FILES_DIR / "obstacles.json",
)

LOCALIZATION_PROCESS = ProcessDefinition(
    name="localization",
    script_path=_path_from_env(
        "TRACKSPRAYER_LOCALIZATION_SCRIPT",
        BACKEND_DIR / "scripts" / "mock_start_localization.sh",
    ),
    working_directory=_path_from_env(
        "TRACKSPRAYER_LOCALIZATION_CWD",
        BACKEND_DIR,
    ),
)

NAVIGATION_PROCESS = ProcessDefinition(
    name="navigation",
    script_path=_path_from_env(
        "TRACKSPRAYER_NAVIGATION_SCRIPT",
        BACKEND_DIR / "scripts" / "mock_start_navigation.sh",
    ),
    working_directory=_path_from_env(
        "TRACKSPRAYER_NAVIGATION_CWD",
        BACKEND_DIR,
    ),
)

PROCESS_DEFINITIONS = {
    LOCALIZATION_PROCESS.name: LOCALIZATION_PROCESS,
    NAVIGATION_PROCESS.name: NAVIGATION_PROCESS,
}

ROSBRIDGE_URL = os.getenv("TRACKSPRAYER_ROSBRIDGE_URL", "")
ROSBRIDGE_READY_TOPIC = os.getenv("TRACKSPRAYER_READY_TOPIC", "/robot_ready")
ROSBRIDGE_READY_TYPE = os.getenv("TRACKSPRAYER_READY_TYPE", "std_msgs/Bool")
ROSBRIDGE_READY_TIMEOUT_SECONDS = _float_from_env(
    "TRACKSPRAYER_READY_TIMEOUT_SECONDS",
    10.0,
)
