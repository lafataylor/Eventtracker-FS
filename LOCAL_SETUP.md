# LOCAL_SETUP.md — running Lafa's List locally

Validated 2026-08-15 on macOS (Darwin), Python 3.12, Node 22. Both apps run against a **copy** of the production DB. Nothing here touches production.

## 0. Why the repo doesn't run as-is (blockers found & fixed)
1. `requirements.txt` line 16 is `django-dbbackuppython-dotenv` — two packages fused by a missing newline → `pip install` aborts.
2. Zero version pins → on Python 3.14/3.12 pip resolves `openai` 3.x / `apify-client` 3.x, which the code (written for `openai` 1.x) can't import.
3. `logs/` dir doesn't exist → `RotatingFileHandler` raises `ValueError: Unable to configure handler 'file'` at startup.
4. `apify-client` needs `apify-shared==1.1.x` (2.x removed `ignore_docs`); `openai` 1.54 needs `httpx==0.27` (0.28 removed `proxies`).
5. `OpenAI()` and Firebase `db = firebase.database()` run at **import time** (`scraper.py:72`, `c_admin/views.py:74`) → the app won't boot without an OpenAI key, a Firebase service-account JSON, and Firebase env vars — even to serve a read-only endpoint.
6. **Migrations 0009–0011 (c_admin) + others were never committed** → `NodeNotFoundError`, `runserver` won't start even with a DB.

## 1. API — Django

```bash
# from repo root
cd API/API

# 1. venv + pinned deps (do NOT use the repo requirements.txt)
python3.12 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
cat > /tmp/req.txt <<'EOF'
Django==4.2.16
djangorestframework==3.15.2
django-cors-headers==4.4.0
django-dbbackup==4.2.1
python-dotenv==1.0.1
PyJWT==2.9.0
python-dateutil==2.9.0.post0
pytz==2024.2
six==1.16.0
sqlparse==0.5.1
asgiref==3.8.1
tenacity==8.5.0
requests==2.32.3
Pyrebase4==4.9.0
apify-client==1.8.1
apify-shared==1.1.2
openai==1.54.4
httpx==0.27.2
celery==5.4.0
fuzzywuzzy[speedup]
imageio[ffmpeg]
EOF
pip install -r /tmp/req.txt

# 2. runtime dir the log handler needs
mkdir -p logs

# 3. Firebase service-account STUB (real values not needed locally; import-time only).
#    The shipped firebase-service-account.example.json does NOT work — Pyrebase
#    rejects its placeholder key. Generate a throwaway RSA key:
python - <<'PY'
import json, subprocess
key = subprocess.run(["openssl","genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048"],
                     capture_output=True, text=True).stdout
json.dump({"type":"service_account","project_id":"local-dev-stub","private_key_id":"localstub",
  "private_key":key,"client_email":"local@local-dev-stub.iam.gserviceaccount.com","client_id":"0",
  "auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/local"},
  open("firebase-service-account.json","w"), indent=2)
print("wrote firebase-service-account.json (throwaway key, gitignored path)")
PY
```

**Env files** (both gitignored). `API/API/.env.local` holds Talha's real keys (OPENAI/APIFY/etc). `API/API/.env` fills the import-time gaps `.env.local` leaves empty — `settings.py` loads `.env.local` first, then `.env`, and python-dotenv does not override already-set keys:
```
# API/API/.env  (local dev only — NOT production values)
DJANGO_SECRET_KEY=local-dev-only-not-a-real-secret
FIREBASE_API_KEY=local-dev-stub
FIREBASE_AUTH_DOMAIN=local-dev-stub.firebaseapp.com
FIREBASE_DATABASE_URL=https://local-dev-stub-default-rtdb.firebaseio.com/
FIREBASE_PROJECT_ID=local-dev-stub
FIREBASE_STORAGE_BUCKET=local-dev-stub.appspot.com
FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json

# CRITICAL: the scraper and admin "add by Instagram URL" save events by
# HTTP-calling c_admin/constants.py HOST, which DEFAULTS TO PRODUCTION.
# Without this override, a local run of either path writes into the prod DB.
EVENT_API_HOST=http://127.0.0.1:8009/
```

**Database** — two options:
- **Empty DB (fastest):** `python manage.py migrate` builds a schema matching the models (reconstructed migrations are already in the repo, labeled `RECONSTRUCTED PLACEHOLDER`). App runs; no data.
- **Prod copy (for the data work):** use a prod DB snapshot copy, kept OUTSIDE the repo on purpose (ask the current maintainer for its location). Do **not** point Django's `NAME` at it and `migrate` — prod's migration ledger differs from the repo (AUDIT §8); Django will conflict. For querying, use `sqlite3` directly or a read-only Django settings profile with `migrate --fake`. Reconciliation (rename placeholders to prod's real names) is an open question in PLAN.md.

```bash
python manage.py migrate         # empty-DB path
python manage.py runserver 8009
# verify: curl http://127.0.0.1:8009/v1/event/locations/  → 200 []
```

## 2. FE — Next.js

```bash
cd FE
npm install
# point the app at the LOCAL api (FE/.env.local, gitignored):
echo 'NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8009/v1' >> .env.local
npm run dev -- -p 3009
# open http://127.0.0.1:3009/mexico-city
```

**One source change was required** — `FE/services/apiClient.tsx` hardcoded the production URL and ignored `NEXT_PUBLIC_API_BASE_URL`. It now reads the env var with the **production URL as the default**, so deployed behaviour is unchanged when the var is unset. The trailing slash is normalized (relative calls here need it; `utils/locations.ts`/`geocode.ts` build `${BASE}/admin/...` and must not) — without normalization, setting the var produced `/v1//event/...` → 403.

## 3. What this session changed in the repo (all reversible)
- **Tracked, 1 file:** `FE/services/apiClient.tsx` (env-driven base URL, prod-safe default).
- **Reconstructed migrations (local-run only, labeled as such):** `c_admin/0009,0010,0011`, `c_admin/0013`, `c_auth/0006`, `event/0007`.
- **Gitignored (invisible to git):** `API/API/.env`, `API/API/.env.local`, `FE/.env.local`, `API/API/firebase-service-account.json` (throwaway key), `API/API/db.sqlite3` (local empty DB).
- **Recommend:** add `*.sqlite3` and `*.db` to `.gitignore` (currently absent — a 548 MB prod DB could be committed by accident on a public repo).

## 4. Verified working
- API: `manage.py check` → no issues; `runserver` serves `/v1/*`; `makemigrations --check` → "No changes detected" (models ↔ migrations consistent).
- FE: `/mexico-city`, `/es`, `/admin/duplicates` render; browser → Next.js → **local** Django confirmed via access log (25 `/v1/*` calls, 0 double-slash 403s).
- "No Events Found" is correct on the empty DB.
