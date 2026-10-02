"""Pass PostgreSQL connection settings through environment, never CLI arguments."""

import os
import subprocess
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

if __name__ == "__main__":
    url = urlsplit(os.environ[sys.argv[1]])
    if url.scheme not in ("postgres", "postgresql") or not url.hostname:
        raise SystemExit("Use a PostgreSQL URL with an explicit host")
    env = os.environ.copy()
    settings = {
        "PGHOST": url.hostname,
        "PGPORT": str(url.port or 5432),
        "PGDATABASE": unquote(url.path.lstrip("/")),
        "PGUSER": unquote(url.username or ""),
        "PGPASSWORD": unquote(url.password or ""),
    }
    mapping = {
        "sslmode": "PGSSLMODE",
        "sslrootcert": "PGSSLROOTCERT",
        "connect_timeout": "PGCONNECT_TIMEOUT",
        "options": "PGOPTIONS",
        "channel_binding": "PGCHANNELBINDING",
        "application_name": "PGAPPNAME",
    }
    for name, value in parse_qsl(url.query):
        if name not in mapping:
            raise SystemExit(f"Unsupported database URL option: {name}")
        settings[mapping[name]] = value
    env.update({key: value for key, value in settings.items() if value})
    args = sys.argv[2:]
    if "--dbname-from-env" in args:
        index = args.index("--dbname-from-env")
        args[index : index + 1] = ["--dbname", settings["PGDATABASE"]]
    raise SystemExit(subprocess.run(args, env=env).returncode)
