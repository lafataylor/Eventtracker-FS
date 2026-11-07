#!/bin/bash
# Lafa's List self-serve deploy (added 2026-11-07, owner asked to deploy from
# Cursor without a developer).
#
# How it works: `make deploy` on any machine moves the `production` branch on
# GitHub to the current `main`. This script runs on the server every two
# minutes from cron, notices the branch moved, and ships it:
#   preflight -> safety rail -> API tests -> API swap -> site build -> site swap
#   -> live check (puts BOTH parts back if it fails) -> status page.
# The server only READS from GitHub, so no deploy key or password ever leaves
# the server, and nothing a laptop holds can run commands here.
#
# Safety rail: a change to a database migration or to the Python packages
# stops before anything is touched. deploy_api.sh runs `migrate` on every
# deploy and the production database has its own migration history, so those
# changes need a developer. Everything else, including site packages
# (npm installs them during the build), the owner can ship alone.
#
# Failures: a wrong change (tests or build fail, safety rail) stops that
# commit until a new one is pushed. A passing problem (network, a slow
# restart) is retried up to 3 times before it stops.
#
# One-time setup before enabling cron: write the live API tree id to
# $STATE/live_api_tree (see docs/DEPLOYING.md). The status page is
# https://lafaslist.com/deploy-status (plain text, public: secrets are masked).
set -uo pipefail

REPO_URL=${REPO_URL:-https://github.com/lafataylor/Eventtracker-FS.git}
BRANCH=${BRANCH:-production}
STATE=${STATE:-/home/ubuntu/autodeploy}
STATUS_FILE=${STATUS_FILE:-/var/www/lafaslist-deploy/status.txt}
MISC=${MISC:-/home/ubuntu/misc}
LIVE_API=/home/ubuntu/EventTracker-API/API
LIVE_FE=/home/ubuntu/EventTracker-FE
STAGE_FE=/home/ubuntu/deploy-staging-fe
PY=/home/ubuntu/EventTracker-API/venv/bin/python
NODE_BIN=/home/ubuntu/.nvm/versions/node/v20.14.0/bin
SITE=https://lafaslist.com
API_CHECK=https://eventtrackerapi.lafaslist.com/v1/event/locations/
MAX_TRIES=3

# ---------------------------------------------------------------- helpers

# Tree id of PATH inside COMMIT (empty if missing).
tree_of() { git -C "$1" rev-parse -q --verify "$2:$3" 2>/dev/null; }

# Paths (relative to API/API) that must not ship without a developer:
# migrations added, edited or removed, and Python package changes.
# Unknown live tree -> refuse rather than guess.
blocking_changes() {
  local repo=$1 live_api_tree=$2 commit=$3 new_tree
  new_tree=$(tree_of "$repo" "$commit" API/API) || true
  if ! git -C "$repo" cat-file -e "$live_api_tree^{tree}" 2>/dev/null || [ -z "$new_tree" ]; then
    echo "cannot compare with the live version"; return
  fi
  git -C "$repo" diff --name-only "$live_api_tree" "$new_tree" \
    | grep -E '(^|/)migrations/[^/]+\.py$|(^|/)requirements[^/]*\.txt$' || true
}

# The version `make rollback` should put back: the newest earlier live
# version that is older code than CURRENT. After a rollback the undone
# version is newer code, so it is never offered again.
previous_live() { # repo current history_file
  local sha
  [ -f "$3" ] || return 0
  for sha in $(awk '{a[NR]=$0} END{for(i=NR;i>0;i--) print a[i]}' "$3"); do
    [ "$sha" = "$2" ] && continue
    if git -C "$1" merge-base --is-ancestor "$sha" "$2" 2>/dev/null; then echo "$sha"; return; fi
  done
}

# The status page is public: hide anything shaped like a key or password.
mask_secrets() {
  sed -E 's/(sk-[A-Za-z0-9_-]+|[A-Za-z_]*(KEY|SECRET|TOKEN|PASSWORD|PASS)[A-Za-z_]*=[^ ]*)/[hidden]/g'
}

# Deploy hours in Central time, worked out from the UTC window so they stay
# right across daylight saving.
deploy_hours() {
  local a b
  a=$(TZ=America/Chicago date -d '03:00 UTC' '+%-I:%M %p' 2>/dev/null) \
    && b=$(TZ=America/Chicago date -d '20:30 UTC' '+%-I:%M %p' 2>/dev/null) \
    && echo "$a to $b Central" || echo "03:00 to 20:30 UTC"
}

central_time() { TZ=America/Chicago date '+%a %b %-d, %-I:%M %p Central'; }
short() { git -C "$STATE/repo" log -1 --format='%h "%s"' "$1" 2>/dev/null; }
statefile() { cat "$STATE/$1" 2>/dev/null; }
log_history() { echo "$(central_time)  $*" >> "$STATE/history.log"; }

# Status page: what is live, what the last request did, and recent history.
write_status() { # headline, details
  local live_sha prev_sha tmp
  live_sha=$(statefile live_sha)
  prev_sha=$([ -n "$live_sha" ] && previous_live "$STATE/repo" "$live_sha" "$STATE/live_history")
  tmp=$(mktemp)
  {
    echo "LAFA'S LIST DEPLOYS"
    echo "Updated $(central_time)"
    echo
    echo "NOW: $1"
    [ -n "${2:-}" ] && printf '%s\n' "$2"
    echo
    if [ -n "$live_sha" ]; then echo "LIVE: $(short "$live_sha") since $(statefile live_since)"; fi
    if [ -n "$(statefile live_api_partial)" ]; then echo "NOTE: the server (API) part of $(short "$(statefile live_api_partial)") is also live."; fi
    if [ -n "$prev_sha" ]; then echo "PREVIOUS: $(git -C "$STATE/repo" rev-parse --short "$prev_sha") (make rollback puts this one back)"; fi
    echo
    echo "Deploys run between $(deploy_hours) today. A request made outside"
    echo "those hours waits and goes out on its own when they open (the nightly"
    echo "Instagram import runs in the gap)."
    echo
    echo "RECENT"
    tail -n 8 "$STATE/history.log" 2>/dev/null | awk '{a[NR]=$0} END{for(i=NR;i>0;i--) print a[i]}'
  } | mask_secrets > "$tmp"
  install -m 644 "$tmp" "$STATUS_FILE" 2>/dev/null || cp "$tmp" "$STATUS_FILE"
  rm -f "$tmp"
}

# A wrong change: stop this commit until a new one is pushed.
give_up() { # headline, details
  echo "$TARGET" > "$STATE/stopped_sha"
  rm -f "$STATE/tries_$TARGET"
  log_history "$(short "$TARGET"): $1"
  write_status "$1" "$2"
  echo "STOPPED: $1"
  exit 1
}

# A passing problem: retry on the next runs, give up after MAX_TRIES.
retry_or_give_up() { # headline, details
  local n; n=$(( $(statefile "tries_$TARGET" || echo 0) + 1 ))
  if [ "$n" -ge "$MAX_TRIES" ]; then give_up "$1 (tried $n times)" "$2"; fi
  echo "$n" > "$STATE/tries_$TARGET"
  log_history "$(short "$TARGET"): $1, will try again"
  write_status "$1. Trying again in a few minutes (attempt $n of $MAX_TRIES)." "$2"
  exit 1
}

api_up() { # waits up to ~40s for a slow restart
  local i
  for i in 1 2 3 4 5 6 7 8; do
    [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$API_CHECK")" = "200" ] && return 0
    sleep 5
  done
  return 1
}

site_healthy() {
  local p code
  for p in / /mexico-city/ /los-angeles/ /berlin/ /bali/ /admin/login/; do
    code=$(curl -s -o /dev/null -L -m 30 -w '%{http_code}' "$SITE$p")
    [ "$code" = "200" ] || { echo "$p answered $code"; return 1; }
  done
  api_up || { echo "the API did not answer"; return 1; }
}

# API tests against the new code, borrowing the live environment with spend
# keys replaced by placeholders and the API host pinned to a dead port, so no
# test can spend money or reach the live site. In-memory test database.
run_api_tests() { # api_dir
  (cd "$1" && "$PY" - > "$STATE/last-tests.txt" 2>&1 <<'PY'
import os, sys, runpy
from dotenv import load_dotenv
LIVE = "/home/ubuntu/EventTracker-API/API"
load_dotenv(os.path.join(LIVE, ".env.local"))
os.environ["FIREBASE_SERVICE_ACCOUNT_PATH"] = os.path.join(LIVE, "firebase-service-account.json")
os.environ["EVENT_API_HOST"] = "http://127.0.0.1:9/"
os.environ["OPENAI_API_KEY"] = "sk-autodeploy-placeholder"
os.environ["APIFY_API_KEY"] = "apify_api_autodeploy-placeholder"
sys.argv = ["manage.py", "test", "event", "c_admin", "c_auth", "--noinput"]
runpy.run_path("manage.py", run_name="__main__")
PY
  )
  grep -q '^OK' "$STATE/last-tests.txt"
}

# 0 built, 1 build failed (the change is wrong), 2 install failed (passing).
build_site() { # fe_dir
  export PATH="$NODE_BIN:$PATH"
  rm -rf "$STAGE_FE" && cp -a "$1" "$STAGE_FE" && cp "$LIVE_FE/.env.local" "$STAGE_FE/" || return 2
  cd "$STAGE_FE" || return 2
  # Who sees the full admin menu; read at build time.
  grep -q "^NEXT_PUBLIC_SUPERADMIN_EMAILS=" .env.local || printf "\nNEXT_PUBLIC_SUPERADMIN_EMAILS=makemoremusic@gmail.com\n" >> .env.local
  npm install --no-audit --no-fund --loglevel=error > npm-install.log 2>&1 || return 2
  npm run build > build.log 2>&1 && echo "=== done" >> build.log
  grep -q "=== done" build.log || return 1
}

newest_old_site() { ls -1dt /home/ubuntu/EventTracker-FE.old-* 2>/dev/null | head -1; }

# Put the previous site back, but only if this deploy actually moved it
# aside (OLD_BEFORE is the newest .old-* folder from before the swap).
# Otherwise just make sure the live site is running.
rollback_site() {
  export PATH="$NODE_BIN:$PATH"
  local old; old=$(newest_old_site)
  if [ -n "$old" ] && [ "$old" != "${OLD_BEFORE:-}" ]; then
    pm2 stop nextjs >/dev/null 2>&1 9>&-
    rm -rf "$LIVE_FE.failed" && mv "$LIVE_FE" "$LIVE_FE.failed" && mv "$old" "$LIVE_FE" || return 1
  fi
  (cd "$LIVE_FE" && pm2 restart nextjs >/dev/null 2>&1 9>&- && pm2 save >/dev/null 2>&1 9>&-)
}

rollback_api() { # tarball
  [ -n "$1" ] && [ -f "$1" ] || return 1
  tar xzf "$1" -C "$LIVE_API" && sudo systemctl restart gunicorn 9>&- && api_up
}

# ---------------------------------------------------------------- main

main() {
  mkdir -p "$STATE"
  exec 9>"$STATE/lock"
  flock -n 9 || exit 0     # a deploy is already running

  if [ ! -d "$STATE/repo/.git" ]; then
    git clone -q --filter=blob:none --no-checkout "$REPO_URL" "$STATE/repo" || exit 1
  fi
  git -C "$STATE/repo" fetch -q --filter=blob:none origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null || exit 0
  TARGET=$(git -C "$STATE/repo" rev-parse "origin/$BRANCH") || exit 0

  [ "$TARGET" = "$(statefile live_sha)" ] && exit 0
  [ "$TARGET" = "$(statefile stopped_sha)" ] && exit 0

  local title; title=$(short "$TARGET")
  if ! "$MISC/preflight.sh" > "$STATE/last-preflight.txt" 2>&1; then
    if [ "$(statefile waiting_sha)" != "$TARGET" ]; then
      echo "$TARGET" > "$STATE/waiting_sha"
      log_history "$title: requested, waiting for the deploy hours"
    fi
    write_status "WAITING to deploy $title" "$(grep FAIL "$STATE/last-preflight.txt" | sed 's/^ *FAIL: /Reason: /')
It goes out on its own as soon as it can. Nothing to do."
    exit 0
  fi

  local live_api live_fe new_api new_fe blocked
  live_api=$(statefile live_api_tree); live_fe=$(statefile live_fe_tree)
  new_api=$(tree_of "$STATE/repo" "$TARGET" API/API); new_fe=$(tree_of "$STATE/repo" "$TARGET" FE)

  if [ -z "$live_api" ]; then
    write_status "NOT SET UP: the server does not know which version is live yet" "Nothing was changed. Zain needs to finish the one-time setup in docs/DEPLOYING.md."
    exit 1
  fi
  if [ "$new_api" != "$live_api" ]; then
    blocked=$(blocking_changes "$STATE/repo" "$live_api" "$TARGET")
    if [ "$blocked" = "cannot compare with the live version" ]; then
      give_up "STOPPED $title, the server could not compare it with the live version" "Nothing was changed; the site is as it was. Send this to Zain."
    elif [ -n "$blocked" ]; then
      give_up "STOPPED $title, it needs a developer" "This change touches the database layout or the server's Python packages:
$(echo "$blocked" | sed 's/^/  API\/API\//')
Those cannot go live automatically. Nothing was changed; the site is as it was.
Send this to Zain."
    fi
  fi

  log_history "$title: deploying"
  write_status "DEPLOYING $title" "Started $(central_time). Takes about 5 to 10 minutes. The site blinks for under a minute near the end."

  local src="$STATE/build"; rm -rf "$src"; mkdir -p "$src"
  git -C "$STATE/repo" archive "$TARGET" | tar -x -C "$src" \
    || retry_or_give_up "FAILED $title, could not download the code" "Nothing was changed; the site is as it was."

  # ---- API
  local api_tarball="" api_changed="" fe_changed=""
  if [ "$new_api" != "$live_api" ]; then
    api_changed=yes
    run_api_tests "$src/API/API" || give_up "FAILED $title, the automatic tests did not pass" "Nothing was changed; the site is as it was.
$(grep -E '^(FAIL|ERROR|Traceback|AssertionError)|Error:' "$STATE/last-tests.txt" | head -n 15)"
    SRC="$src/API/API" "$MISC/deploy_api.sh" > "$STATE/last-api.txt" 2>&1 9>&-
    api_tarball=$(grep -o '/home/ubuntu/misc/api-code-predeploy-[0-9-]*\.tar\.gz' "$STATE/last-api.txt" | head -1)
    if ! grep -q "API DEPLOY COMPLETE" "$STATE/last-api.txt" || ! api_up; then
      if [ -z "$api_tarball" ]; then
        # deploy_api.sh stopped before it changed anything (its preflight or backup step).
        retry_or_give_up "FAILED $title, the server part could not start its deploy" "Nothing was changed; the site is as it was."
      elif rollback_api "$api_tarball"; then
        retry_or_give_up "FAILED $title, the server part did not start, so it was put back" "The site is running the previous version."
      else
        give_up "FAILED $title, the server part did not start AND putting it back failed" "The site may be down. Send this to Zain now."
      fi
    fi
  fi

  # ---- website
  local OLD_BEFORE="" rc
  if [ "$new_fe" != "$live_fe" ]; then
    fe_changed=yes
    build_site "$src/FE"; rc=$?
    if [ "$rc" -ne 0 ]; then
      local undo=""
      [ -n "$api_changed" ] && { rollback_api "$api_tarball" && undo=" The server part was put back too, so the site is as it was." || undo=" Putting the server part back failed: send this to Zain."; }
      if [ "$rc" -eq 1 ]; then
        give_up "FAILED $title, the website did not build" "Nothing on the live website changed.$undo The error is usually a typo the assistant can fix:
$(tail -n 20 "$STAGE_FE/build.log" 2>/dev/null)"
      else
        retry_or_give_up "FAILED $title, the website packages did not download" "Nothing on the live website changed.$undo"
      fi
    fi
    OLD_BEFORE=$(newest_old_site)
    if ! "$MISC/deploy_fe.sh" > "$STATE/last-fe.txt" 2>&1 9>&-; then
      rollback_site
      [ -n "$api_changed" ] && rollback_api "$api_tarball"
      retry_or_give_up "FAILED $title, the website swap failed, so everything was put back" "The site is running the previous version."
    fi
    PATH="$NODE_BIN:$PATH" pm2 save > /dev/null 2>&1 9>&-   # keep the boot auto-start in step
  fi

  # ---- live check, and put BOTH parts back if it fails
  sleep 5
  local problem
  if ! problem=$(site_healthy); then
    local undone=""
    if [ -n "$fe_changed" ]; then rollback_site && undone="the website"; fi
    if [ -n "$api_changed" ]; then
      if rollback_api "$api_tarball"; then undone="${undone:+$undone and }the server part"; else undone="${undone:+$undone; }putting the server part back FAILED"; fi
    fi
    retry_or_give_up "FAILED $title, the live check failed ($problem)" "Put back: ${undone:-nothing needed to be}. Send this to Zain if it keeps happening."
  fi

  # ---- success
  [ -n "$api_changed" ] && echo "$new_api" > "$STATE/live_api_tree"
  [ -n "$fe_changed" ] && echo "$new_fe" > "$STATE/live_fe_tree"
  echo "$TARGET" > "$STATE/live_sha"
  echo "$TARGET" >> "$STATE/live_history"
  central_time > "$STATE/live_since"
  rm -f "$STATE/waiting_sha" "$STATE/tries_$TARGET" "$STATE/live_api_partial"
  log_history "$title: LIVE"
  write_status "LIVE. $title went live at $(central_time)." "Checked: every city page, the admin login and the API answer normally."
  rm -rf "$src"
}

[ -n "${AUTODEPLOY_NO_MAIN:-}" ] || main "$@"
