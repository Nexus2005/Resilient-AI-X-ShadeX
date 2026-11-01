"""DB connectivity + idempotent migration runner.

Migrations are recorded in public.schema_migrations. A migration that predates the
tracking table is treated as applied when its marker object already exists, so an
existing database is not re-run from 0001.
"""
import re
import sys
from pathlib import Path

import psycopg2

BACKEND = Path(__file__).resolve().parent.parent

# filename -> object that proves the migration was already applied
MIGRATION_MARKERS: dict[str, tuple[str, str]] = {
    "0001_identity_institutions_applications.sql": ("table", "public.profiles"),
    "0002_documents_processing.sql": ("table", "public.document_versions"),
    "0003_rules_findings.sql": ("table", "public.findings"),
    "0004_verification_reports_audit.sql": ("table", "public.report_records"),
    "0005_audit_functions_rls.sql": ("function", "public.verify_audit_chain"),
    "0006_backend_auth_credentials.sql": ("table", "public.auth_credentials"),
    "0007_intake_module.sql": ("table", "public.intake_checklists"),
}


def load_db_url() -> str:
    env = (BACKEND / ".env").read_text(encoding="utf-8")
    match = re.search(r"^DATABASE_URL=(\S+)", env, re.M)
    if not match:
        raise SystemExit("DATABASE_URL missing in backend/.env")
    return match.group(1)


def object_exists(cur, kind: str, name: str) -> bool:
    if kind == "table":
        cur.execute("select to_regclass(%s) is not null", (name,))
    else:
        cur.execute(
            "select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
            "where n.nspname = %s and p.proname = %s)",
            (name.split(".")[0], name.split(".")[1]),
        )
    return bool(cur.fetchone()[0])


def main() -> None:
    url = load_db_url()
    conn = psycopg2.connect(url, sslmode="require", connect_timeout=25)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("select current_database(), current_user")
    print("connected as", cur.fetchone())

    cur.execute(
        "create table if not exists public.schema_migrations ("
        "filename text primary key, applied_at timestamptz not null default now())"
    )
    conn.commit()
    cur.execute("select filename from public.schema_migrations")
    applied = {row[0] for row in cur.fetchall()}

    # Adopt pre-existing schemas without replaying historical migrations.
    for filename, (kind, name) in MIGRATION_MARKERS.items():
        if filename in applied:
            continue
        if object_exists(cur, kind, name):
            cur.execute("insert into public.schema_migrations(filename) values (%s) on conflict do nothing", (filename,))
            applied.add(filename)
            print("already present, recorded", filename)
    conn.commit()

    for path in sorted((BACKEND / "migrations").glob("*.sql")):
        if path.name in applied:
            continue
        cur.execute(path.read_text(encoding="utf-8"))
        cur.execute("insert into public.schema_migrations(filename) values (%s)", (path.name,))
        conn.commit()
        print("applied", path.name)

    cur.execute(
        "select table_schema || '.' || table_name from information_schema.tables "
        "where table_schema in ('public','auth') and table_name in ('profiles','auth_users','users')"
        " order by 1"
    )
    print("key tables present:", cur.fetchall())
    cur.execute("select count(*) from public.audit_events")
    print("audit_events rows:", cur.fetchone()[0])
    cur.execute("select public.verify_audit_chain()")
    broken = cur.fetchall()
    print("audit chain problems:", broken if broken else "none")
    cur.close()
    conn.close()
    print("OK")


if __name__ == "__main__":
    try:
        main()
    except psycopg2.Error as exc:
        print("DB ERROR:", exc, file=sys.stderr)
        raise SystemExit(1)
