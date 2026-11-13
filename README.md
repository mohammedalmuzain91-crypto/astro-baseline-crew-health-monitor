# Astro·Baseline — Crew Health Monitor (NASA Space Apps 2026 prototype)

Compares each astronaut with **their own** pre-flight baseline and tells the crew medical officer who to check first.
Not a diagnostic tool. Live readings are simulated; lab results are real NASA OSDR data (Inspiration4).

## Run
Open `web/index.html` in any modern browser (double-click works, fully offline, no install, no server).

## Rebuild the data (optional)
Needs Python 3 + pandas. From this folder: `python tools/process_osdr.py`
Reads `data/raw/` (never edited) and writes `data/processed/osdr_labs.json` and `web/js/osdr.js`.

## Layout
```
web/index.html, css/style.css, js/{data,osdr,engine,ui,voice}.js, assets/ (optimized background video + poster)
data/raw/        NASA files as received (OSD-569 CBC, OSD-575 CMP, ISA metadata)
data/processed/  cleaned JSON
tools/process_osdr.py
docs/TECHNICAL_REPORT.md
```
## Data honesty
- Real: OSD-569 (CBC) and OSD-575 (CMP) lab results, 4 crew, L-92…R+194. Missing results stay missing.
- Simulated: heart rate, SpO2, temperature, the 3 scenarios, alerts. NASA data has none of these.
- Alert thresholds are ours, not clinically validated (`web/js/engine.js`).
- One CBC sample (C003, L-92) in NASA's file has shifted columns; it is excluded from baselines and flagged.

## Demo behaviour
- The app starts in the "Sustained change (A3)" scenario (`E.DEFAULT_SCENARIO` in engine.js): after about 6 s on ANY screen, A3 goes to Alert and the voice speaks. No need to open Live monitor.
- A scenario selector sits bottom-right on every screen (next to Read / Stop), so you can switch scenario from anywhere.
- Footer shows the build label, so you can check you opened the newest copy.
- Chrome blocks sound until the page got one click/tap/key. Until then the bottom-right box shows "Click anywhere once to enable sound", and waiting messages play at the first click.

## Alerts: acknowledge, repeat, escalate (engine.js `TIMING`)
- Nobody has to watch the screen: the voice speaks every new Note / Alert / sensor dropout by itself.
- An Alert or sensor dropout stays on screen (red banner + alert log) until someone presses **Acknowledge**. The time of acknowledgement is logged.
- Not acknowledged: the voice repeats it every 20 s ("Reminder...").
- Still not acknowledged after 60 s: it is escalated ("Alert the whole crew now"), marked ESCALATED in the banner, and an "escalation" report is queued for Earth.
- Pressing Acknowledge stops the speech. Notes are spoken once and need no acknowledgement.
- 20 s and 60 s are demo values we chose, not clinical standards. Change them in `E.TIMING` (engine.js).

## Voice (works offline)
- Speaks by itself (on by default; the "Voice guidance" button on Live monitor turns it off/on).
- "Read alerts & notes" button (bottom-right, every screen) reads the whole log and crew notes; "Stop" cancels.
- Uses the browser's built-in speech synthesis with a voice installed on the device. No microphone, no internet.
- Chrome only allows speech after one click/tap on the page, so click once (for example "Open the dashboard") before the demo.
- If you hear nothing: check the device volume and that an English voice is installed (Windows: Settings > Time & language > Speech). Use Chrome or Edge.
