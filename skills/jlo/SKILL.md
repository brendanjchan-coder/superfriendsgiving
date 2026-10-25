---
name: jlo
description: Plan a new event with Brendan's master event RSVP app. Use when he says "jlo", wants to set up a new RSVP/pot luck event, guest list, date, venue, or a short link for a new gathering.
---

# JLo — event planner

JLo sets up a new event on Brendan's personal event app (GitHub repo brendanjchan-coder/superfriendsgiving, to be renamed `personal-event-app` after 21 Nov 2026). Each event is a folder under `events/<slug>/` with its own Google Sheet, Apps Script backend and GitHub Pages page. Events never share data. NEVER change the root `index.html` — that is the live SuperFriendsGiving app.

## 1. Ask (AskUserQuestion, one round, then follow-ups in plain text)
Event name · short slug (e.g. bbqwiththeboys2026) · date · start time · where · guest list (names; if a screenshot, read the names and confirm) · guests are families or individuals (`guest_label` family|name) · kids allowed · hosts' emails (default brendanjchan@gmail.com; Nicole is nicoleccadiz@gmail.com) · format/invite line · short link alias. Skip anything already answered.

## 2. Generate
1. `git clone https://github.com/brendanjchan-coder/superfriendsgiving` (public; pushing is not possible from the sandbox — upload through the browser).
2. Write `events/<slug>/config.json` (copy `events/bbqwiththeboys2026/config.json` as the example; fields: slug, name, name_html, emoji, eyebrow, invite, date, time, where, guest_label, kids, admins, guests, sheet_id, api_url).
3. `python3 new_event.py events/<slug>/config.json` writes `index.html` and `Code.gs` there. Syntax-check the page script with node.

## 3. Backend (Claude's built-in browser; user is signed in to Google)
1. Create a sheet at docs.google.com/spreadsheets/create, rename it "<name> RSVPs", put its id in config `sheet_id`, regenerate.
2. script.google.com/home/projects/create: set the code with `window.monaco.editor.getModels()[0].setValue(code)`, click "Save project to Drive", rename the project.
3. Deploy > New deployment > gear > Web app > Execute as Me, Who has access: Anyone > Deploy. The user must click **Authorise access** themselves (OAuth consent can't be done by Claude) — ask, then wait.
4. Copy the /exec URL into config `api_url`, regenerate. Test from a github.io page with fetch POST (text/plain) {fn:'boot',args:[]}: returns the guest list and event; admin calls answer "Please sign in as a host."

## 4. Publish
Add `events/<slug>/index.html` (plus config.json) to the repo through github.com in the browser (new-file page, CodeMirror dispatch, verify the sha256, commit to main). Page URL: https://brendanjchan-coder.github.io/superfriendsgiving/events/<slug>/ (host link adds `?page=admin`). Check the welcome page, that the dropdown lists every guest, and that the host sign-in box shows. Hosts sign in with an emailed 6-digit code; test it once.

## 5. Finish
Short link tinyurl.com/<alias>: the user must click Shorten Link (bot check); free links can't be edited. Report the guest link, host link and anything the user still has to do.

Browser quirks: the JS tool takes action "javascript_exec" and text; screenshots can lag, so confirm state via the DOM; click coordinates are in the 800px screenshot frame (viewport px ÷ 1.411).
