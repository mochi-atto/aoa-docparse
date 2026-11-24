"""Run a synthetic SQLite demo without modifying the original app or env files."""
import argparse
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["prepare", "backend", "frontend"])
    parser.add_argument("--configuration-root", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    configuration = args.configuration_root or root
    if not (configuration / "backend/.env").is_file():
        configuration = root.parents[1]
    backend_env = configuration / "backend/.env"
    if not backend_env.is_file():
        raise SystemExit("Supply --configuration-root pointing to existing private environment files")
    demo = root / ".demo/demo.sqlite"
    environment = dict(os.environ, DATABASE_URL="sqlite:///" + demo.as_posix(),
        AOA_ENV_FILE=str(backend_env), ALLOWED_ORIGINS="http://localhost:5174",
        FRONTEND_URL="http://localhost:5174", SMTP_HOST="", SMTP_FROM="", OPENAI_API_KEY="", ASSET_UPLOAD_DIR=str(root / ".demo/assets"))
    if args.mode == "frontend":
        environment.update(AOA_ENV_DIR=str(configuration / "frontend"), AOA_API_TARGET="http://localhost:8001")
        command = ["npm.cmd" if os.name == "nt" else "npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5174", "--strictPort"]
        working = root / "frontend"
    else:
        working = root / "backend"
        if args.mode == "prepare":
            if demo.exists():
                print("Reusing isolated demo; applying only its reviewed additive migration.", flush=True)
                command = [sys.executable, "-m", "app.migrations", "--apply"]
            else:
                command = [sys.executable, "prepare_demo.py", "--identity-env", str(backend_env)]
        else:
            if not demo.exists():
                raise SystemExit("Run prepare first")
            command = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8001"]
    return subprocess.call(command, cwd=working, env=environment)


if __name__ == "__main__":
    raise SystemExit(main())
