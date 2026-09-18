# Lafa's List: everyday commands. See AGENTS.md for the rules of the road.
# LAFASLIST_VENV overrides where the Python virtualenv lives.
VENV := $(or $(LAFASLIST_VENV),$(CURDIR)/API/API/.venv)

.PHONY: setup test api fe check seed

setup:            ## one-command local setup (safe to re-run)
	scripts/dev_setup.sh

test:             ## API test suite
	cd API/API && $(VENV)/bin/python manage.py test event c_admin c_auth --noinput

api:              ## run the API locally on :8009
	cd API/API && $(VENV)/bin/python manage.py runserver 8009

fe:               ## run the site locally on :3009 (needs the API running)
	cd FE && npm run dev -- -p 3009

check:            ## site typecheck, unfiltered
	cd FE && npx tsc --noEmit

seed:             ## labelled demo events into the LOCAL database (refuses elsewhere)
	cd API/API && $(VENV)/bin/python manage.py seed_demo_events
