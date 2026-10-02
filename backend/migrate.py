"""Apply checksummed migrations, using a direct/session PostgreSQL connection."""

import hashlib
from pathlib import Path

import psycopg

import config


def migrate():
    if not config.DATABASE_URL:
        raise RuntimeError("Set DATABASE_URL")
    with psycopg.connect(config.DATABASE_URL) as conn:
        conn.execute("SELECT pg_advisory_xact_lock(58390271)")
        conn.execute("CREATE SCHEMA IF NOT EXISTS crm")
        conn.execute("REVOKE ALL ON SCHEMA crm FROM PUBLIC")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS crm.schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        for path in sorted(Path(__file__).with_name("migrations").glob("*.sql")):
            checksum = hashlib.sha256(path.read_bytes()).hexdigest()
            row = conn.execute(
                "SELECT checksum FROM crm.schema_migrations WHERE name=%s", (path.name,)
            ).fetchone()
            if row:
                if row[0] != checksum:
                    raise RuntimeError(f"Migration changed: {path.name}")
                continue
            conn.execute(path.read_text())
            conn.execute(
                "INSERT INTO crm.schema_migrations(name,checksum) VALUES (%s,%s)", (path.name, checksum)
            )
            print(f"Applied {path.name}")


if __name__ == "__main__":
    migrate()
