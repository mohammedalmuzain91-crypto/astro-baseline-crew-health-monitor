/* Offline voice. Speaks BY ITSELF when a new Note / Alert / sensor-dropout appears, and can read the log on demand.
   Uses the voices installed on the device (speechSynthesis): no microphone, no internet. Load after ui.js.
   Browser rule: Chrome only allows speech after the page got one click/tap/key press, so earlier messages wait and play at the first one. */
(function () {
  const AB = window.AB, E = AB.engine;
  if (!("speechSynthesis" in window)) return;
  const V = AB.voice = { on: true };
  const LBL = { note: "Note", alert: "Alert", unavailable: "Sensor data unavailable" };
  const ACT = { note: "Repeat the measurement.", alert: "Contact the crew medical officer.", unavailable: "Check the sensor." };

  const speakable = s => String(s)
    .replace(/SpO2/g, "S P O 2").replace(/\+(\d)/g, "plus $1").replace(/[−-](\d)/g, "minus $1")
    .replace(/%/g, " percent").replace(/°C/g, " degrees Celsius").replace(/\bvs\b/g, "versus");
  const alertText = x => `${LBL[x.status] || x.status} for crew member ${x.id}. ${speakable(x.why)} ${ACT[x.status] || ""}`;

  function pickVoice() { // prefer a voice stored on this device so it works offline
    const vs = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith("en"));
    return vs.find(v => v.localService) || vs[0] || null;
  }
  function say(lines, urgent) {
    if (urgent) speechSynthesis.cancel();
    const v = pickVoice();
    lines.forEach(t => { // one utterance per message: long ones get cut off in Chrome
      const u = new SpeechSynthesisUtterance(t); u.lang = "en-US"; u.rate = 0.95; if (v) u.voice = v;
      speechSynthesis.speak(u);
    });
  }

  // --- automatic: nobody has to open or press anything. New alerts are spoken, unacknowledged ones are repeated, escalations are announced. ---
  const seen = new WeakSet(), escSeen = new WeakSet(), last = new WeakMap(); let pending = [];
  const active = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  const needs = x => E.needsAck(x) && !x.ack;
  function announce(list) { list.forEach(x => last.set(x, Date.now())); say(list.map(alertText), list.some(x => x.status === "alert")) }
  function flush() { const l = pending.splice(0).filter(x => !x.ack); if (l.length && V.on) announce(l) }
  ["pointerdown", "keydown", "touchstart"].forEach(ev => addEventListener(ev, () => setTimeout(flush, 50), { passive: true }));
  E.on(ev => { if (ev === "ack") speechSynthesis.cancel() }); // acknowledged: stop talking
  let prevLen = 0;
  setInterval(() => { // scenario switched (alerts cleared): stop talking about the old one
    if (E.alerts.length === 0 && prevLen > 0) { speechSynthesis.cancel(); pending = [] }
    prevLen = E.alerts.length;
    const hint = document.getElementById("v-hint"); if (hint) hint.style.display = active() ? "none" : "block";
    const sel = document.getElementById("v-sc"); if (sel && sel.value !== E.scenario && document.activeElement !== sel) sel.value = E.scenario;
  }, 500);
  setInterval(() => {
    const fresh = E.alerts.filter(x => !seen.has(x)).reverse(); // oldest first
    fresh.forEach(x => seen.add(x));
    if (!V.on) return;
    if (!active()) { pending.push(...fresh); return }
    if (fresh.length) announce(fresh);
    const now = Date.now();
    E.alerts.forEach(x => {
      if (!needs(x) || fresh.includes(x)) return;
      if (x.escalated && !escSeen.has(x)) { escSeen.add(x); last.set(x, now); say([`Escalation. ${LBL[x.status]} for crew member ${x.id} was not acknowledged. Alert the whole crew now.`], true); return }
      if (now - (last.get(x) || x.at.getTime()) >= E.TIMING.repeat) { last.set(x, now); say([`Reminder. ${alertText(x)}`], false) }
    });
  }, 500);

  // --- on demand: read the whole log + crew notes ---
  function lines() {
    const out = [];
    E.alerts.slice(0, 6).forEach(x => out.push(alertText(x)));
    E.reports.filter(r => r.type === "crew note").slice(0, 6).forEach(r => out.push(`Crew note for ${r.astro}. ${speakable(r.why)}.`));
    return out.length ? out : ["No alerts and no crew notes right now."];
  }
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;bottom:1rem;right:1rem;z-index:30;display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end";
  const opts = AB.DATA.scenarios.map(x => `<option value="${x.id}">${x.name}</option>`).join("");
  box.innerHTML = '<div id="v-hint" class="mut" style="flex-basis:100%;text-align:right;background:rgba(6,3,9,.85);padding:.2rem .5rem;border-radius:6px">🔈 Click anywhere once to enable sound</div>' +
    `<select id="v-sc" aria-label="Demo scenario" style="width:auto;background:rgba(6,3,9,.85)">${opts}</select>` +
    '<button class="btn" id="v-read" aria-label="Read alerts and crew notes aloud">🔊 Read alerts &amp; notes</button>' +
    '<button class="btn ghost" id="v-stop" aria-label="Stop reading" style="background:rgba(6,3,9,.85)">⏹ Stop</button>';
  document.body.append(box);
  document.getElementById("v-sc").value = E.scenario;
  document.getElementById("v-sc").onchange = e => { E.reset(e.target.value); if (AB.refreshView) AB.refreshView() };
  document.getElementById("v-read").onclick = () => { speechSynthesis.cancel(); setTimeout(() => say(lines(), false), 80); };
  document.getElementById("v-stop").onclick = () => { speechSynthesis.cancel(); pending = []; };
  speechSynthesis.onvoiceschanged = () => { };
})();
