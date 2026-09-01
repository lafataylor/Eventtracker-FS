#!/bin/bash
# Synthetic check for client-side crashes on lafaslist.com.
#
# WHY THIS EXISTS AND WHY IT USES A BROWSER: on 2026-09-01 a null field made
# React unmount the whole app, and every visitor saw a blank page reading
# "Application error: a client-side exception has occurred". The SERVER was
# healthy the entire time — it returned 200, the HTML was correct, and the
# deploy verifier's curl saw nothing wrong. The failure only exists after
# hydration, so it can only be seen by something that actually runs the page's
# JavaScript. curl cannot catch this class of bug. We found out because the
# owner texted a screenshot; this is here so that never has to happen again.
#
# Exit 0 = pages render. Exit 1 = a page is broken for real users.
#
# Run it hourly:
#   0 * * * * /path/to/scripts/smoke_check.sh >> /tmp/lafaslist_smoke.log 2>&1
set -uo pipefail

BASE="${SMOKE_BASE_URL:-https://lafaslist.com}"
PAGES=("/" "/mexico-city/" "/los-angeles/" "/berlin/" "/bali/")
FAILED=0

command -v agent-browser >/dev/null 2>&1 || {
    echo "SKIP: agent-browser not installed; this check needs a real browser"
    exit 0
}

for page in "${PAGES[@]}"; do
    agent-browser open "${BASE}${page}" >/dev/null 2>&1
    # Hydration plus the first data fetch. The 2026-09-01 crash happened only
    # once events arrived, so checking too early would have reported healthy.
    sleep 8
    # Three distinct failure shapes, and the second one is the subtle one:
    #   Application error  -> React unmounted, Next's bare fallback (no
    #                         ErrorBoundary reached it)
    #   data-crashed       -> our ErrorBoundary caught it. This MUST be checked
    #                         too: the boundary replaces the "Application
    #                         error" text, so grepping for that alone reports a
    #                         healthy site while every visitor sees a failure
    #                         panel. Verified against a broken build.
    #   EMPTY              -> hydrated to nothing at all
    verdict=$(agent-browser eval \
        "(() => { const t = document.body.innerText;
                  if (t.includes('Application error')) return 'CRASH';
                  if (document.querySelector('[data-crashed]')) return 'CAUGHT_CRASH';
                  if (t.trim().length < 40) return 'EMPTY';
                  return 'ok'; })()" 2>/dev/null | tr -d '\"')

    if [ "$verdict" != "ok" ]; then
        echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') FAIL ${page} -> ${verdict}"
        FAILED=1
    fi
done

if [ "$FAILED" -eq 0 ]; then
    echo "$(date -u '+%Y-%m-%d %H:%M:%S UTC') ok: all ${#PAGES[@]} pages render"
    exit 0
fi

echo "SITE IS BROKEN FOR USERS — check the browser console and"
echo "logs/client_errors.log on the API box."
exit 1
