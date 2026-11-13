# Technical report

## Failures found (by running the app in headless Chromium)

1. **Overview rendered "Could not load crew data" (root cause).** `ui.js` called `AB.distance()`, which does not exist; the function is exposed as `AB.engine.distance`. The exception was thrown inside the boot `try/catch`, so the first screen showed an error and never rendered. Fix: `E.distance(...)` in `ui.js`.
2. **Mobile horizontal overflow on Live monitor** (1px at 390px). `1fr` grid tracks grew to the table's min-content. Fix: `minmax(0,1fr)` + `min-width:0` in `style.css`.
3. **Data issue in NASA file:** OSD-569 sample C003 L-92 has shifted columns (e.g. MPV = 330 fL), which produced a false −91% shift. `process_osdr.py` now flags it (absolute-count consistency check + 5x lab-range check); the UI excludes it and says so.

## Changes

- Real data connected (`tools/process_osdr.py` -> `osdr.js`); Crew detail shows real labs vs own baseline, lab range comparison, and top R+1 shifts. Simulated vitals kept separate.
- Crew detail updates its status block in place, so the measure dropdown is not reset by live ticks.

## Verified (headless Chromium via Playwright, desktop 1280px and mobile 390px)

All 5 screens + all 4 crew detail pages + unknown-crew state: no console or page errors, no failed requests, no horizontal overflow. Scenarios, pause, form validation, report queue, alert banner, mobile menu, analyte dropdown (incl. missing, excluded and no-baseline cases).

## Not verified

Real-device/Safari/Firefox rendering, voice guidance audio, video playback performance on low-end phones.

## Added later
- `web/js/voice.js`: offline voice that reads alerts and crew notes (speech synthesis only, no microphone).
- `ui.js`: `route()` now waits until crew data is ready, so a hash change during the 0.5 s loading screen cannot crash it.
- Re-verified in headless Chromium (desktop 1280px, mobile 390px): all screens, alert scenario, crew note, voice reading. No console errors, no overflow.
- Acknowledge / repeat / escalation added (`engine.js`, `ui.js`, `voice.js`). Tested in headless Chromium with shortened timings: spoken on its own, repeated, escalated, stopped by Acknowledge, no console errors, no overflow at 1280px and 390px.
- Build v3: app starts in the alert scenario; scenario selector + sound hint on every screen; voice stops when the scenario is switched. Tested from the Overview with nothing touched (banner appears, speech queued until first click), then switching scenarios by the selector; no console errors, no overflow at 1280px and 390px.
