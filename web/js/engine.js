/* Baseline comparison, 3-reading rule, status and report queue. Deterministic. */
(function () {
  const AB = window.AB, D = AB.DATA;
  const DEMO_THRESHOLDS = { hr: { off: 15, major: 30 }, spo2: { off: -3, major: -4.5 }, temp: { off: 0.8, major: 1.5 } }; // not clinically validated
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 };
  AB.baseline = a => { const o = {};["hr", "spo2", "temp"].forEach(k => { o[k] = { min: Math.min(...a[k]), max: Math.max(...a[k]), mean: mean(a[k]) } }); return o };

  function reading(a, t, sc) {
    const b = AB.baseline(a), r = rng(a.id.charCodeAt(1) * 1000 + t);
    const n = () => (r() - .5) * 2;
    let hr = b.hr.mean * (1 + n() * .012), spo2 = b.spo2.mean + n() * .3, temp = b.temp.mean + n() * .1;
    if (sc === "alert" && a.id === "A3" && t >= 4) { hr = b.hr.mean * (1.43 + n() * .01); spo2 = b.spo2.mean * (0.95 + n() * .001); temp += .3 }
    if (sc === "dropout" && a.id === "A2" && t >= 5) return null;
    if (sc === "dropout" && a.id === "A1" && t >= 3) hr = b.hr.mean * (1.18 + n() * .01);
    return { t, hr: +hr.toFixed(1), spo2: +spo2.toFixed(1), temp: +temp.toFixed(1), is_demo: true };
  }
  function dev(a, rd) {
    const b = AB.baseline(a); return {
      hr: (rd.hr - b.hr.mean) / b.hr.mean * 100,
      spo2: (rd.spo2 - b.spo2.mean) / b.spo2.mean * 100,
      temp: rd.temp - b.temp.mean
    }
  }
  const fmt = (k, v) => k === "temp" ? `temp ${v >= 0 ? "+" : ""}${v.toFixed(1)}°C` : `${k === "hr" ? "heart rate" : "SpO2"} ${v >= 0 ? "+" : ""}${v.toFixed(0)}%`;

  // Status needs 3 readings in a row. One odd reading never raises anything.
  function judge(a, hist) {
    const last = hist.slice(-3);
    if (last.length && last[last.length - 1] === null) return { status: "unavailable", why: "Sensor stopped reporting. Reading is not reliable and is not estimated." };
    if (last.length < 3 || last.includes(null)) return { status: "collecting", why: `Collecting readings (${last.filter(Boolean).length}/3).` };
    const T = DEMO_THRESHOLDS, per = last.map(rd => dev(a, rd));
    const off = k => per.every(d => k === "hr" ? Math.abs(d.hr) >= T.hr.off : k === "spo2" ? d.spo2 <= T.spo2.off : d.temp >= T.temp.off);
    const major = k => per.every(d => k === "hr" ? Math.abs(d.hr) >= T.hr.major : k === "spo2" ? d.spo2 <= T.spo2.major : d.temp >= T.temp.major);
    const keys = ["hr", "spo2", "temp"], o = keys.filter(off), m = keys.filter(major), d = per[2];
    const text = o.map(k => fmt(k, d[k])).join(", ") + " vs own baseline, sustained for 3 readings";
    if (m.length || o.length >= 2) return { status: "alert", why: text, metrics: o };
    if (o.length) return { status: "note", why: text, metrics: o };
    return { status: "normal", why: "No change worth flagging against own baseline." };
  }
  // How far the latest reading sits outside its owner's range (in % of baseline mean) – used to rank Overview
  function distance(a, rd) {
    if (!rd) return -1; const b = AB.baseline(a);
    const out = (v, k) => v < b[k].min ? (b[k].min - v) / b[k].mean : v > b[k].max ? (v - b[k].max) / b[k].mean : 0;
    return Math.max(out(rd.hr, "hr"), out(rd.spo2, "spo2") * 3, out(rd.temp, "temp") / 10) * 100
  }

  const E = {
    scenario: "nominal", DEFAULT_SCENARIO: "alert", /* scenario the app starts with */ seq: 0, TIMING: { repeat: 20000, escalate: 60000 }, /* ms; demo values, not clinical standards */ t: 0, hist: {}, status: {}, alerts: [], reports: [], listeners: [], timer: null, running: true,
    DEMO_THRESHOLDS, judge, distance, dev,
    reset(sc) {
      clearInterval(E.timer); E.scenario = sc || E.scenario; E.t = 0; E.alerts = []; E.reports = [];
      D.crew.forEach(a => { E.hist[a.id] = []; E.status[a.id] = { status: "collecting", why: "" } });
      for (let i = 0; i < 3; i++)E.step(true); E.emit(); E.start()
    },
    start() { clearInterval(E.timer); if (E.running) E.timer = setInterval(() => E.step(), 2000) },
    toggle() { E.running = !E.running; E.running ? E.start() : clearInterval(E.timer); E.emit() },
    step(silent) {
      E.t++;
      D.crew.forEach(a => {
        E.hist[a.id].push(reading(a, E.t, E.scenario));
        const prev = E.status[a.id].status, j = judge(a, E.hist[a.id]); E.status[a.id] = j;
        if (j.status !== prev && ["note", "alert", "unavailable"].includes(j.status)) {
          E.alerts.unshift({ n: ++E.seq, id: a.id, status: j.status, why: j.why, t: E.t, at: new Date(), ack: null, escalated: false });
          if (j.status === "alert") E.reports.unshift({ id: "R" + (E.reports.length + 1), astro: a.id, why: j.why, created: Date.now(), eta: Date.now() + 45000, type: "alert" });
          if (!silent && j.status === "alert") E.emit("alert", a.id, j.why)
        }
      });
      E.reports.forEach(r => { if (r.state !== "delivered" && Date.now() >= r.eta) r.state = "delivered" });
      if (!silent) E.emit()
    },
    addNote(astro, text) { E.reports.unshift({ id: "R" + (E.reports.length + 1), astro, why: text, created: Date.now(), eta: Date.now() + 45000, type: "crew note" }); E.emit() },
    needsAck: x => x.status === "alert" || x.status === "unavailable",
    ack(n) { const x = E.alerts.find(a => String(a.n) === String(n)); if (x && !x.ack) { x.ack = new Date(); E.emit("ack", x.id) } },
    on(f) { E.listeners.push(f) }, emit(ev, a, w) { E.listeners.forEach(f => f(ev, a, w)) }
  };
  AB.engine = E;
  // Escalation: an alert nobody acknowledged in time is escalated to the whole crew and queued for Earth. Runs on its own timer (also while paused).
  setInterval(() => {
    const now = Date.now(); let ch = false;
    E.alerts.forEach(x => {
      if (E.needsAck(x) && !x.ack && !x.escalated && now - x.at.getTime() >= E.TIMING.escalate) {
        x.escalated = true; ch = true;
        E.reports.unshift({ id: "R" + (E.reports.length + 1), astro: x.id, why: `Not acknowledged for ${Math.round(E.TIMING.escalate / 1000)} s, whole crew alerted. ${x.why}`, created: now, eta: now + 45000, type: "escalation" })
      }
    });
    if (ch) E.emit("escalate")
  }, 1000);
})();
