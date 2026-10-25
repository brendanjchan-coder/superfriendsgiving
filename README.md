# Personal event app
Master RSVP app for pot luck gatherings (free: GitHub Pages + Google Apps Script + Google Sheets).

- Root `index.html` is the live **SuperFriendsGiving** page. Do not change it until that event is over.
- `events/<slug>/` holds each new event (config.json, generated index.html and Code.gs).
- `templates/` and `new_event.py` generate an event: `python3 new_event.py events/<slug>/config.json`.
- `skills/jlo/SKILL.md` is the JLo planner skill that walks through creating a new event.

Events: SuperFriendsGiving (root), BBQ with the Boys (`events/bbqwiththeboys2026/`).
