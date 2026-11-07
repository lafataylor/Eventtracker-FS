#!/bin/bash
# Tests for the decision logic in autodeploy.sh: which changes the owner can
# ship alone, and which must stop for a developer. Run: bash scripts/server/test_autodeploy.sh
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
AUTODEPLOY_NO_MAIN=1 source "$HERE/autodeploy.sh"

FAILS=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1"; echo "     expected: [$2]"; echo "     actual:   [$3]"; FAILS=$((FAILS + 1)); fi
}

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git -C "$T" init -q
git -C "$T" config user.email t@t; git -C "$T" config user.name t
mkdir -p "$T/API/API/event/migrations" "$T/FE/pages"
echo "x" > "$T/API/API/event/views.py"
echo "m" > "$T/API/API/event/migrations/0001_initial.py"
echo "Django==5.0.6" > "$T/API/API/requirements.txt"
echo "page" > "$T/FE/pages/index.tsx"
git -C "$T" add -A; git -C "$T" commit -qm base
BASE_API=$(git -C "$T" rev-parse HEAD:API/API)
BASE_FE=$(git -C "$T" rev-parse HEAD:FE)

# 1. An ordinary code change is not blocking.
echo "y" > "$T/API/API/event/views.py"; git -C "$T" commit -qam code
check "plain code change does not block" "" "$(blocking_changes "$T" "$BASE_API" HEAD)"

# 2. A new migration blocks.
echo "m2" > "$T/API/API/event/migrations/0002_new.py"; git -C "$T" add -A; git -C "$T" commit -qm mig
check "new migration blocks" "event/migrations/0002_new.py" "$(blocking_changes "$T" "$BASE_API" HEAD)"

# 3. An edited migration blocks too.
git -C "$T" rm -q "$T/API/API/event/migrations/0002_new.py"; echo "edited" > "$T/API/API/event/migrations/0001_initial.py"; git -C "$T" commit -qam edit
check "edited migration blocks" "event/migrations/0001_initial.py" "$(blocking_changes "$T" "$BASE_API" HEAD)"

# 4. A Python package change blocks.
git -C "$T" checkout -q HEAD~1 -- API/API/event/migrations/0001_initial.py 2>/dev/null
git -C "$T" show "$BASE_API:event/migrations/0001_initial.py" > "$T/API/API/event/migrations/0001_initial.py"
echo "rapidfuzz==3.13.0" >> "$T/API/API/requirements.txt"; git -C "$T" commit -qam reqs
check "requirements change blocks" "requirements.txt" "$(blocking_changes "$T" "$BASE_API" HEAD)"

# 5. Site-only changes never block, whatever they are.
git -C "$T" show "$BASE_API:requirements.txt" > "$T/API/API/requirements.txt"
echo "new page" > "$T/FE/pages/index.tsx"; echo '{"dependencies":{}}' > "$T/FE/package.json"; git -C "$T" add -A; git -C "$T" commit -qm fe
check "site change does not block" "" "$(blocking_changes "$T" "$BASE_API" HEAD)"

# 6. Tree helpers report what changed.
check "api tree changed after code edit" "yes" "$( [ "$(tree_of "$T" HEAD API/API)" != "$BASE_API" ] && echo yes || echo no)"
check "fe tree changed after page edit" "yes" "$( [ "$(tree_of "$T" HEAD FE)" != "$BASE_FE" ] && echo yes || echo no)"
check "unknown live tree is treated as blocking (fail safe)" "cannot compare with the live version" "$(blocking_changes "$T" 0000000000000000000000000000000000000000 HEAD)"

# 7. Rollback target: the newest earlier live version that is OLDER code than
#    what is live now, so a second rollback never brings the undone change back.
A=$(git -C "$T" rev-list --max-parents=0 HEAD)
B=$(git -C "$T" rev-parse HEAD~2); C=$(git -C "$T" rev-parse HEAD)
H="$T/live_history"; printf '%s\n' "$A" "$B" "$C" > "$H"
check "previous of C is B" "$B" "$(previous_live "$T" "$C" "$H")"
printf '%s\n' "$A" "$B" "$C" "$B" > "$H"          # rolled back C -> B
check "after a rollback, previous is A, never the undone C" "$A" "$(previous_live "$T" "$B" "$H")"
printf '%s\n' "$A" > "$H"
check "nothing older: no previous" "" "$(previous_live "$T" "$A" "$H")"

# 8. Secrets never reach the public status page.
check "ordinary words are left alone" "task-runner ok" "$(echo "task-runner ok" | mask_secrets)"
check "keys are masked" "token [hidden] and [hidden] ok" "$(echo "token sk-abc123 and API_KEY=xyz ok" | mask_secrets)"

# 9. Waiting reasons are plain words.
P="$T/pre.txt"
echo "  FAIL: inside the nightly scrape window (deploy between 03:00 and 20:30 UTC)" > "$P"
check "outside hours is explained" "yes" "$(wait_reason "$P" | grep -q "outside deploy hours" && echo yes)"
echo "  FAIL: pipeline wrote 3 min ago - too recent, may still be active" > "$P"
printf '  ok: outside the scrape window\n  FAIL: pipeline wrote 3 min ago - too recent, may still be active\n' > "$P"
check "passing lines never decide the reason" "Reason: the nightly Instagram import is still running." "$(wait_reason "$P")"
echo "  FAIL: pipeline wrote 3 min ago - too recent, may still be active" > "$P"
check "import running is explained" "Reason: the nightly Instagram import is still running." "$(wait_reason "$P")"

[ "$FAILS" -eq 0 ] && echo "ALL PASSED" || { echo "$FAILS FAILED"; exit 1; }
