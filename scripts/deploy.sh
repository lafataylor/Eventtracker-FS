#!/bin/bash
# Owner self-serve deploy, run from Cursor (or any terminal) via:
#   make deploy          put the current main live
#   make deploy-status   what is live, and what the last request did
#   make rollback        put the previous live version back
#
# This only moves the `production` branch on GitHub. The server checks that
# branch every two minutes and does the rest itself (tests, build, swap, live
# check, automatic rollback on failure): scripts/server/autodeploy.sh.
# Nothing on this machine can run anything on the server.
set -euo pipefail
STATUS_URL=https://lafaslist.com/deploy-status
cd "$(git rev-parse --show-toplevel)"

status() { curl -s -m 20 "$STATUS_URL" || echo "Could not reach $STATUS_URL"; }

case "${1:-}" in
  deploy)
    git fetch -q origin
    branch=$(git rev-parse --abbrev-ref HEAD)
    if [ "$branch" != "main" ]; then
      echo "You are on the branch '$branch', not main."
      echo "Merge your pull request on GitHub first, then: git checkout main && git pull && make deploy"
      exit 1
    fi
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      echo "There are unsaved changes (not committed). Commit them, or ask the assistant to, then run make deploy again."
      git status --short --untracked-files=no
      exit 1
    fi
    if ! git merge-base --is-ancestor origin/main HEAD; then
      echo "GitHub has newer changes on main than this computer. Run: git pull, then make deploy again."
      exit 1
    fi
    # Quiet on success (GitHub otherwise suggests a pull request for production).
    quiet_push() { local out; out=$(git push -q "$@" 2>&1) || { echo "$out"; echo "The push to GitHub failed; nothing was requested."; exit 1; }; }
    quiet_push origin main                       # publish any local commits first
    quiet_push --force origin main:production    # production is only a pointer to what should be live
    echo "Requested: $(git log -1 --format='%h "%s"')"
    echo "The server picks this up within 2 minutes and takes about 5 to 10 minutes to put it live."
    echo "Deploys run overnight to mid-afternoon Central (the status page shows today's hours); outside them it waits and goes out on its own."
    echo "Follow it with: make deploy-status   (or open $STATUS_URL)"
    ;;
  status)
    status
    ;;
  rollback)
    prev=$(status | sed -n 's/^PREVIOUS: \([0-9a-f]\{7,40\}\).*/\1/p' | head -1)
    if [ -z "$prev" ]; then echo "The status page shows no previous version to go back to."; exit 1; fi
    git fetch -q origin
    out=$(git push -q --force origin "$prev:refs/heads/production" 2>&1) || { echo "$out"; echo "The push to GitHub failed; nothing was requested."; exit 1; }
    echo "Requested a rollback to $(git log -1 --format='%h "%s"' "$prev" 2>/dev/null || echo "$prev")."
    echo "Follow it with: make deploy-status"
    echo "Note: main still has the newer change. Undo it on main too, or the next make deploy brings it back."
    ;;
  *)
    echo "usage: scripts/deploy.sh deploy|status|rollback"; exit 1 ;;
esac
