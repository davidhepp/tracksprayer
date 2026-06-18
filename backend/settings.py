import os
from dataclasses import dataclass
from pathlib import Path
from typing import List


BACKEND_DIR = Path(__file__).resolve().parent
APP_DIR = BACKEND_DIR.parent
WORKSPACE_DIR = APP_DIR.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'\"")

        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(APP_DIR / ".env")
_load_dotenv(BACKEND_DIR / ".env")


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


def _list_from_env(name: str, fallback: List[str]) -> List[str]:
    raw_value = os.getenv(name)
    if raw_value is None:
        return fallback

    values = [value.strip() for value in raw_value.split(",") if value.strip()]
    return values or fallback


def _int_list_from_env(name: str, fallback: List[int]) -> List[int]:
    raw_values = _list_from_env(name, [str(value) for value in fallback])
    values: List[int] = []

    for raw_value in raw_values:
        try:
            values.append(int(raw_value))
        except ValueError:
            continue

    return values or fallback


TRACKSPRAYER_MODE = os.getenv("TRACKSPRAYER_MODE", "dev").strip().lower()
IS_MOCK_MODE = TRACKSPRAYER_MODE in {"dev", "mock", "test"}

ROBOT_REPO_DIR = _path_from_env(
    "TRACKSPRAYER_ROBOT_REPO_DIR",
    WORKSPACE_DIR / "trackSprayRobot",
)
ROBOT_WORKSPACE_DIR = ROBOT_REPO_DIR / "robot"
ROBOT_SHARED_FILES_DIR = ROBOT_REPO_DIR / "shared_files"

if IS_MOCK_MODE:
    _shared_files_fallback = BACKEND_DIR / "shared_files"
    _localization_script_fallback = BACKEND_DIR / "scripts" / "mock_start_localization.sh"
    _navigation_script_fallback = BACKEND_DIR / "scripts" / "mock_start_navigation.sh"
    _process_cwd_fallback = BACKEND_DIR
    _rosbridge_url_fallback = ""
else:
    _shared_files_fallback = ROBOT_SHARED_FILES_DIR
    _localization_script_fallback = (
        ROBOT_REPO_DIR / "deploy" / "scripts" / "start_localization.sh"
    )
    _navigation_script_fallback = (
        ROBOT_REPO_DIR / "deploy" / "scripts" / "start_navigation.sh"
    )
    _process_cwd_fallback = ROBOT_WORKSPACE_DIR
    _rosbridge_url_fallback = "ws://localhost:9090"

SHARED_FILES_DIR = _path_from_env("TRACKSPRAYER_SHARED_DIR", _shared_files_fallback)
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
        _localization_script_fallback,
    ),
    working_directory=_path_from_env(
        "TRACKSPRAYER_LOCALIZATION_CWD",
        _process_cwd_fallback,
    ),
)

NAVIGATION_PROCESS = ProcessDefinition(
    name="navigation",
    script_path=_path_from_env(
        "TRACKSPRAYER_NAVIGATION_SCRIPT",
        _navigation_script_fallback,
    ),
    working_directory=_path_from_env(
        "TRACKSPRAYER_NAVIGATION_CWD",
        _process_cwd_fallback,
    ),
)

PROCESS_DEFINITIONS = {
    LOCALIZATION_PROCESS.name: LOCALIZATION_PROCESS,
    NAVIGATION_PROCESS.name: NAVIGATION_PROCESS,
}

ROSBRIDGE_URL = "" if IS_MOCK_MODE else os.getenv(
    "TRACKSPRAYER_ROSBRIDGE_URL",
    _rosbridge_url_fallback,
)
ROSBRIDGE_READY_TOPIC = os.getenv("TRACKSPRAYER_READY_TOPIC", "/gps/quality")
ROSBRIDGE_READY_TYPE = os.getenv("TRACKSPRAYER_READY_TYPE", "std_msgs/UInt8")
ROSBRIDGE_READY_VALUES = _int_list_from_env("TRACKSPRAYER_READY_VALUES", [4, 5])
ROSBRIDGE_READY_TIMEOUT_SECONDS = _float_from_env(
    "TRACKSPRAYER_READY_TIMEOUT_SECONDS",
    30.0,
)

CORS_ORIGINS = _list_from_env(
    "TRACKSPRAYER_CORS_ORIGINS",
    [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
)
