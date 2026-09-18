#!/bin/bash
# One-command local setup for Lafa's List. Safe to re-run.
#
# Sets up the Django API and the Next.js site against an EMPTY local database
# with placeholder credentials. Nothing here can reach production: the host the
# scraper posts events to is pinned to this machine (EVENT_API_HOST), and the
# OpenAI / Apify / Firebase values are stubs, so a scrape or an "add by
# Instagram URL" fails locally instead of writing to the live site or spending
# credits. Real keys, if you have them, go in API/API/.env.local (gitignored),
# which is read first and never overwritten by this script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/API/API"
FE="$ROOT/FE"
# Override to keep the virtualenv outside the repo (e.g. an iCloud-synced
# folder evicts files inside .venv and Python then hangs on import).
VENV="${LAFASLIST_VENV:-$API/.venv}"

say() { printf '\n== %s\n' "$*"; }

# ---------- Python ----------
PY=""
for c in python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1; then
        v=$("$c" -c 'import sys; print("%d.%d" % sys.version_info[:2])')
        case "$v" in 3.10|3.11|3.12) PY="$c"; break;; esac
    fi
done
if [ -z "$PY" ]; then
    echo "Need Python 3.10, 3.11 or 3.12 on the PATH (macOS: brew install python@3.12)."
    exit 1
fi
say "Python: $PY ($("$PY" --version))"

if [ ! -x "$VENV/bin/python" ]; then
    say "Creating virtualenv at $VENV"
    "$PY" -m venv "$VENV"
fi
say "Installing API dependencies (pinned in API/API/requirements.txt)"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r "$API/requirements.txt"

# ---------- Local environment: stubs, never real keys ----------
if [ ! -f "$API/.env" ]; then
    say "Writing $API/.env (local placeholders)"
    cat > "$API/.env" <<'ENV'
# Local development only. Placeholders, not real credentials.
# Real keys belong in .env.local (gitignored), which is read before this file.
DJANGO_SECRET_KEY=local-dev-only-not-a-real-secret
OPENAI_API_KEY=sk-local-dev-placeholder
APIFY_API_KEY=apify_api_local-dev-placeholder
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=local-dev-only
FIREBASE_API_KEY=local-dev-stub
FIREBASE_AUTH_DOMAIN=local-dev-stub.firebaseapp.com
FIREBASE_DATABASE_URL=https://local-dev-stub-default-rtdb.firebaseio.com/
FIREBASE_PROJECT_ID=local-dev-stub
FIREBASE_STORAGE_BUCKET=local-dev-stub.appspot.com
FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json
# The scraper and "add by Instagram URL" save events by calling the API over
# HTTP, and the code's default host is PRODUCTION. This pins it to this machine.
EVENT_API_HOST=http://127.0.0.1:8009/
ENV
else
    say "$API/.env already exists; leaving it alone"
    # cat, not a two-file grep: grep exits 2 when .env.local is absent (the
    # usual case) even if .env has the line, which raised this warning on
    # every re-run.
    if ! cat "$API/.env" "$API/.env.local" 2>/dev/null | grep -q '^EVENT_API_HOST='; then
        echo "WARNING: EVENT_API_HOST is not set. A local scrape or add-by-URL would"
        echo "         write into PRODUCTION. Add to $API/.env:"
        echo "         EVENT_API_HOST=http://127.0.0.1:8009/"
    fi
fi

# Firebase's client library loads a service-account file at import time. This
# is a throwaway key that satisfies the parser; it cannot reach any project.
if [ ! -f "$API/firebase-service-account.json" ]; then
    say "Writing a throwaway Firebase service-account stub"
    "$VENV/bin/python" - "$API/firebase-service-account.json" <<'PY'
import json, subprocess, sys
key = subprocess.run(
    ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048"],
    capture_output=True, text=True, check=True).stdout
json.dump({
    "type": "service_account", "project_id": "local-dev-stub",
    "private_key_id": "localstub", "private_key": key,
    "client_email": "local@local-dev-stub.iam.gserviceaccount.com", "client_id": "0",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/local",
}, open(sys.argv[1], "w"), indent=2)
PY
fi

mkdir -p "$API/logs"

# ---------- Database ----------
# A fresh clone gets an empty local database. An existing one (a maintainer's
# data copy) is never migrated by this script: its migration ledger may differ.
if [ ! -f "$API/db.sqlite3" ]; then
    say "Creating a local database with a few labelled demo events"
    (cd "$API" && "$VENV/bin/python" manage.py migrate --noinput | tail -1)
    (cd "$API" && "$VENV/bin/python" manage.py seed_demo_events)
else
    say "Local database already exists; not touching it"
fi

# ---------- Proof ----------
say "Running the API test suite"
(cd "$API" && "$VENV/bin/python" manage.py test event c_admin c_auth --noinput 2>&1 | tail -3)

# ---------- Site ----------
if command -v node >/dev/null 2>&1; then
    say "Node: $(node --version)"
    if [ ! -f "$FE/.env.local" ]; then
        printf 'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8009/v1\n' > "$FE/.env.local"
    fi
    say "Installing site dependencies"
    (cd "$FE" && npm install --no-audit --no-fund --loglevel=error)
else
    echo "Node not found; skipping the site. Install Node 18+ (brew install node) and re-run."
fi

cat <<DONE

== Done. Next:
   make api    # API on http://127.0.0.1:8009  (empty database)
   make fe     # site on http://127.0.0.1:3009 (in a second terminal)
   make test   # API tests
   make seed   # (re)insert the demo events into the local database
DONE
