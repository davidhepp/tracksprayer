# tracksprayer

## Development stack

Run the backend and frontend together from the repository root:

```bash
./run-dev-stack.sh
```

The script creates `backend/.venv` if needed, installs `backend/requirements.txt`,
starts the FastAPI backend on port `8000`, starts the frontend dev server, and
stops both services when either one exits.

Raspberry Pi robot setup is documented in [PI_SETUP.md](PI_SETUP.md).
