(function () {
  const AB = window.AB, D = AB.DATA, E = AB.engine, $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SYM = { normal: "●", note: "▲", alert: "■", unavailable: "◌", collecting: "○" };
  const LBL = { normal: "Normal", note: "Note", alert: "Alert", unavailable: "Data unavailable", collecting: "Collecting" };
  const NEXT = { normal: "No action needed.", note: "Change is sustained: repeat the measurement.", alert: "Contact the crew medical officer, alert the crew, and follow the mission protocol.", unavailable: "Check the sensor. Treat the last reading as unreliable.", collecting: "Waiting for 3 readings in a row." };
  const pill = s => `<span class="pill s-${s}"><span aria-hidden="true">${SYM[s]}</span>${LBL[s]}</span>`;
  const demo = '<span class="mut">Simulated demo data</span>';
  let voice = true; // automatic spoken alerts are ON by default (done by voice.js)
  const view = $("#view");

  function ranked() { return D.crew.map(a => { const h = E.hist[a.id], rd = h[h.length - 1]; return { a, rd, st: E.status[a.id], d: E.distance(a, rd) } }).sort((x, y) => y.d - x.d) }


  const PRE = ["L-92", "L-44", "L-3"]; let selAn = "cbc:hemoglobin";
  function statusBlock(a) { const st = E.status[a.id]; return `<div class="row">${pill(st.status)}</div><p style="margin-top:.6rem">${NEXT[st.status]}</p><p class="mut">${esc(st.why)}</p><p class="mut">Monitoring support only. Not a diagnosis or treatment advice.</p>` }
  function bad(pk, an, who, t) { const R = AB.OSDR, A = R.panels[pk].analytes[an]; return (R.flags[pk] && R.flags[pk][who] && R.flags[pk][who][t]) || (A.flags[who] && A.flags[who][t]) || null }
  function labBase(who, pk, an) {
    const A = AB.OSDR.panels[pk].analytes[an], v = A.values[who] || {}, pre = PRE.filter(t => !bad(pk, an, who, t)).map(t => v[t]).filter(x => x != null);
    if (!pre.length) return null; return { n: pre.length, min: Math.min(...pre), max: Math.max(...pre), mean: pre.reduce((s, x) => s + x, 0) / pre.length, A, v }
  }
  const fx = v => v == null ? "missing" : (Math.abs(v) >= 100 ? v.toFixed(0) : +v.toFixed(2));
  function shiftTable(a) {
    const R = AB.OSDR, rows = [];
    Object.keys(R.panels).forEach(pk => Object.keys(R.panels[pk].analytes).forEach(an => {
      const b = labBase(a.real, pk, an); if (!b) return; const x = b.v["R+1"]; if (x == null || bad(pk, an, a.real, "R+1")) return;
      const pct = (x - b.mean) / b.mean * 100, own = x < b.min || x > b.max, ref = b.A.ref || [null, null], gen = (ref[0] != null && x < ref[0]) || (ref[1] != null && x > ref[1]);
      rows.push({ n: b.A.label, pk, pct, own, gen, x, u: b.A.unit, nb: b.n })
    }));
    rows.sort((p, q) => Math.abs(q.pct) - Math.abs(p.pct));
    if (!rows.length) return '<div class="state">No R+1 results available for this crew member.</div>';
    return `<table><tr><th>Measure</th><th>R+1</th><th>vs own baseline</th><th>Own range</th><th>Lab range</th></tr>${rows.slice(0, 8).map(r => `<tr><td>${esc(r.n)} <span class="mut">${r.pk.toUpperCase()}</span></td><td class="num">${fx(r.x)}</td><td class="num">${r.pct >= 0 ? "+" : ""}${r.pct.toFixed(0)}%${r.nb < 3 ? ` <span class="mut">(n=${r.nb})</span>` : ""}</td><td class="${r.own ? "s-note" : "s-normal"}">${r.own ? "▲ outside" : "● inside"}</td><td class="${r.gen ? "s-alert" : "s-normal"}">${r.gen ? "■ outside" : "● inside"}</td></tr>`).join("")}</table><p class="mut">Top 8 by size of change. “Outside own range” with “inside lab range” is the case a general reference would miss. Real NASA data, historical lab tests.</p>`
  }
  function chart(a) {
    const [pk, an] = selAn.split(":"), b = labBase(a.real, pk, an);
    if (!b) return '<div class="state">No pre-flight samples for this measure, so no baseline can be shown.</div>';
    const tp = AB.OSDR.timepoints.slice().sort((x, y) => ord(x) - ord(y)), vals = tp.map(t => b.v[t]), flg = tp.map(t => bad(pk, an, a.real, t)), got = vals.filter((v, i) => v != null && !flg[i]), ref = b.A.ref || [null, null];
    const lo0 = Math.min(...got, b.min, ref[0] ?? Infinity), hi0 = Math.max(...got, b.max, ref[1] ?? -Infinity), pad = (hi0 - lo0 || 1) * .12, lo = lo0 - pad, hi = hi0 + pad;
    const W = 600, H = 240, X = i => 50 + i * (W - 80) / (tp.length - 1), Y = v => H - 34 - (v - lo) / (hi - lo) * (H - 64); let segs = [], cur = [];
    vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = [] } else cur.push(`${X(i)},${Y(v)}`) }); if (cur.length) segs.push(cur);
    const fi = tp.findIndex(t => t[0] === "R"), fxp = (X(fi - 1) + X(fi)) / 2;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.A.label)} for ${a.real} at ${tp.length} sample times; shaded band is the pre-flight range">
<rect x="40" y="${Y(b.max)}" width="${W - 60}" height="${Math.max(4, Y(b.min) - Y(b.max))}" fill="rgba(59,140,255,.22)"/>
<line x1="${fxp}" x2="${fxp}" y1="16" y2="${H - 34}" stroke="#8fa3cf" stroke-dasharray="4 4"/><text x="${fxp + 5}" y="26">flight</text>
${segs.map(s => `<polyline points="${s.join(" ")}" fill="none" stroke="#fff" stroke-width="2"/>`).join("")}
${tp.map((t, i) => {
      const v = vals[i], out = v != null && (v < b.min || v > b.max), gen = v != null && ((ref[0] != null && v < ref[0]) || (ref[1] != null && v > ref[1]));
      return `<text x="${X(i) - 16}" y="${H - 12}">${t}</text>` + (flg[i] ? `<circle cx="${X(i)}" cy="${H - 44}" r="5" fill="none" stroke="#ff6a55" stroke-dasharray="2 2"/><text x="${X(i) - 22}" y="${H - 54}">excluded</text>` : v == null ? `<circle cx="${X(i)}" cy="${H - 44}" r="5" fill="none" stroke="#9aa5bd" stroke-dasharray="2 2"/><text x="${X(i) - 16}" y="${H - 54}">missing</text>` : `<circle cx="${X(i)}" cy="${Y(v)}" r="5" fill="${out ? "#f0b44c" : "#3ecf8e"}" ${gen ? 'stroke="#ff6a55" stroke-width="3"' : ""}/><text x="${X(i) - 12}" y="${Y(v) - 10}">${fx(v)}</text>`)
    }).join("")}</svg>
<p class="mut">Band = own pre-flight range (L-92, L-44, L-3${b.n < 3 ? `; only ${b.n} sample${b.n > 1 ? "s" : ""}, so a rough estimate` : "; 3 samples, an estimate"}). Red ring = outside the lab's general range${ref[0] != null || ref[1] != null ? ` (${ref[0] ?? "…"}–${ref[1] ?? "…"} ${esc(b.A.unit)})` : ""}. Dashed gray circle = no result in the file; we do not estimate it.${flg.some(Boolean) ? ` <strong class="s-alert">Excluded:</strong> a result in NASA's file for this sample looks corrupted (columns appear shifted), so it is left out of the baseline and the chart.` : ""}</p>`
  }
  function ord(t) { return parseInt(t.slice(1)) + (t[0] === "L" ? -1000 : 0) }
  function labsCard(a) { const R = AB.OSDR; return `<div class="field"><label for="an">Measure</label><select id="an">${Object.keys(R.panels).map(pk => `<optgroup label="${R.panels[pk].study} · ${R.panels[pk].title}">${Object.keys(R.panels[pk].analytes).map(an => { const v = pk + ":" + an; return `<option value="${v}" ${v === selAn ? "selected" : ""}>${esc(R.panels[pk].analytes[an].label)}${R.panels[pk].analytes[an].unit ? " (" + esc(R.panels[pk].analytes[an].unit) + ")" : ""}</option>` }).join("")}</optgroup>`).join("")}</select></div><div id="c-chart">${chart(a)}</div>` }

  const V = {
    overview() {
      const rows = ranked(); return `<h1>Who to check first</h1>
<p class="lede">Crew are ranked by how far their latest reading sits outside their own normal range, not a general average.</p>
<div class="grid g4" style="margin:1.2rem 0">${rows.map((r, i) => `<a class="card crew-card s-${r.st.status}" href="#crew/${r.a.id}" aria-label="${r.a.id}, ${LBL[r.st.status]}">
<div class="row between"><span class="mut">Priority ${i + 1}</span>${pill(r.st.status)}</div>
<div class="big num">${r.a.id}</div>
<div class="mut">${r.rd ? `HR ${r.rd.hr} · SpO2 ${r.rd.spo2}% · ${r.rd.temp}°C` : "No reading"}</div>
<div class="bar" aria-hidden="true"><b style="width:${Math.min(100, Math.max(4, r.d * 4))}%"></b></div>
<p class="mut" style="margin:.5rem 0 0;color:var(--ice)">${r.d < 0 ? "Out of range score unavailable" : "Outside own range by " + r.d.toFixed(1) + "%"}</p></a>`).join("")}</div>
<p>${demo}. Live values are simulated. Rankings are monitoring support, not a diagnosis.</p>`
    },

    crew(id) {
      const a = D.crew.find(x => x.id === id);
      if (!a) return `<div class="state card"><h2>Crew member not found</h2><p>No crew member “${esc(id)}”.</p><a class="btn" href="#overview">Back to overview</a></div>`;
      const b = AB.baseline(a), st = E.status[id], h = E.hist[id], rd = h[h.length - 1];
      return `<a href="#overview" class="mut">← Overview</a><h1>Crew member ${id}</h1><div class="row"><span class="mut">Module: ${a.module}</span><span class="mut">Real lab data: Inspiration4 participant ${a.real}</span></div>
<div class="split" style="margin-top:1rem"><div class="stack">
<div class="card"><h2>Real lab results vs own baseline</h2>${labsCard(a)}</div>
<div class="card"><h2>Shifts at R+1 (first sample after flight)</h2><div class="scroll" id="c-shifts">${shiftTable(a)}</div></div></div>
<div class="stack"><div class="card"><h2>Live status (simulated)</h2><div id="c-status">${statusBlock(a)}</div></div>
<div class="card"><h2>Simulated live baseline range</h2><table><tr><th>Measure</th><th>Range</th><th>Latest</th></tr>
<tr><td>Heart rate</td><td class="num">${b.hr.min}–${b.hr.max}</td><td class="num">${rd ? rd.hr : "n/a"}</td></tr>
<tr><td>SpO2 %</td><td class="num">${b.spo2.min}–${b.spo2.max}</td><td class="num">${rd ? rd.spo2 : "n/a"}</td></tr>
<tr><td>Temp °C</td><td class="num">${b.temp.min}–${b.temp.max}</td><td class="num">${rd ? rd.temp : "n/a"}</td></tr></table><p class="mut" style="margin-top:.6rem">${demo}. NASA data has no heart rate, SpO2 or temperature, so these are kept separate from the lab results.</p></div></div></div>`
    },
    live() {
      return `<h1>Live monitor</h1><p class="lede">Simulated readings arrive every 2 seconds. A status appears only after 3 readings in a row.</p>
<div class="card flat row between" style="margin:1rem 0"><div class="row" role="group" aria-label="Scenario">${D.scenarios.map(s => `<button class="btn ghost" data-sc="${s.id}" aria-pressed="${E.scenario === s.id}" title="${esc(s.desc)}">${s.name}</button>`).join("")}</div>
<div class="row"><button class="btn ghost" id="pause" aria-pressed="${!E.running}">${E.running ? "Pause" : "Resume"}</button><button class="btn ghost" id="voice" aria-pressed="${voice}">Voice guidance ${voice ? "on" : "off"}</button></div></div>
<div class="split"><div class="stack"><div class="card"><h2>Crew status</h2><div class="scroll" id="l-table"></div><p class="mut">${demo}. Thresholds are ours, not clinically validated.</p></div>
<div class="card"><h2>Alert log</h2><ul class="log" id="l-log"></ul></div></div>
<div class="stack"><div class="card"><h2>Report queue to Earth</h2><p class="mut">Delivery delay: 45 minutes (demo: 45 seconds).</p><ul class="log" id="l-rep"></ul></div>
<div class="card"><h2>Module map</h2><div class="modules" id="l-map"></div></div>
<div class="card"><h2>Add crew note to report</h2><form id="note" novalidate><div class="field"><label for="n-a">Crew member</label><select id="n-a"><option value="">Select…</option>${D.crew.map(a => `<option>${a.id}</option>`).join("")}</select><div class="err" id="e-a"></div></div>
<div class="field"><label for="n-t">Note (5–280 characters)</label><textarea id="n-t" rows="3" maxlength="300"></textarea><div class="err" id="e-t"></div></div><button class="btn" type="submit">Add note to report</button></form></div></div></div>`},

    firstaid() {
      return `<h1>First-aid reference</h1><p class="lede">A general reference, separate from any crew member's numbers. We write no treatment steps ourselves. In space, the mission medical protocol comes first.</p>
<div class="grid g3" style="margin:1rem 0">${D.firstAid.map(s => `<div class="card"><h3>${s.org}</h3><p>${s.topic}</p><p class="mut">Year: ${s.year}</p><a href="${s.url}" target="_blank" rel="noopener">Open source</a></div>`).join("")}</div>
${D.firstAidSteps.length ? "" : `<div class="card state"><h3>No steps added yet</h3><p>Each step must be copied from an official source above, with its source and year. Add them in <code>data.js</code> under <code>firstAidSteps</code>.</p></div>`}`
    },

    about() {
      return `<h1>About this prototype</h1><div class="grid g2" style="margin-top:1rem">
<div class="card"><h2>Real</h2><ul><li>NASA OSDR Inspiration4 lab results: OSD-569 (complete blood count) and OSD-575 (metabolic panel). Connected.</li><li>4 crew, sample times L-92, L-44, L-3, R+1, R+45, R+82, and R+194 (which the file also contains).</li><li>Missing results stay missing. Nothing is estimated.</li><li>NASA data is historical blood tests. It has no heart rate, sleep or mood.</li></ul></div>
<div class="card"><h2>Simulated</h2><ul><li>All live readings: heart rate, SpO2, temperature (these are not in the NASA files).</li><li>The three scenarios and the alert log.</li><li>Crew labels A1–A4 are demo names; each is mapped to one Inspiration4 participant (C001–C004) only to show lab data on its detail screen.</li><li>A real device must return the same JSON shape, so the rest of the app does not change.</li></ul></div>
<div class="card"><h2>Limits</h2><ul><li>Not a diagnostic tool. Not a substitute for a doctor or the mission medical protocol.</li><li>Risk thresholds are not clinically validated.</li><li>No AI in decisions: with 4 crew, clear rules are easier to explain and check.</li><li>No HRV: it needs beat-to-beat intervals.</li></ul></div>
<div class="card"><h2>Pitch lines</h2><p>On long missions like Mars, communication with Earth can be delayed by up to 45 minutes each way. Our app compares each astronaut with their own baseline and tells the crew medical officer who to check first.</p></div></div>`}
  };

  const setHTML = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h } }; // only touch the DOM when it changed, so clicks on buttons are never lost
  function banner() {
    const u = E.alerts.filter(x => E.needsAck(x) && !x.ack);
    setHTML($("#banner"), u.length ? `<div class="banner" role="alert">${u.map(x => `<div class="row between" style="margin:.25rem 0"><span><strong>${x.escalated ? "ESCALATED · " : ""}${x.status === "alert" ? "Crew alert" : "Sensor unavailable"}: ${x.id}</strong> — ${x.status === "alert" ? "contact the crew medical officer and follow the mission protocol." : "check the sensor."}${x.escalated ? " Not acknowledged in time: whole crew alerted." : ""}</span><button class="btn" data-ack="${x.n}">Acknowledge</button></div>`).join("")}</div>` : "")
  }

  function fillLive() {
    if (!$("#l-table")) return;
    $("#l-table").innerHTML = `<table><tr><th>Crew</th><th>HR</th><th>SpO2</th><th>Temp</th><th>Status</th></tr>${D.crew.map(a => {
      const h = E.hist[a.id], r = h[h.length - 1], s = E.status[a.id];
      return `<tr><td class="num">${a.id}</td><td class="num">${r ? r.hr : "—"}</td><td class="num">${r ? r.spo2 : "—"}</td><td class="num">${r ? r.temp : "—"}</td><td>${pill(s.status)}</td></tr>`
    }).join("")}</table>`;
    setHTML($("#l-log"), E.alerts.length ? E.alerts.map(x => `<li>${pill(x.status)} <strong>${x.id}</strong> <span class="mut">at reading ${x.t}</span><br><span>${esc(x.why)}</span>${E.needsAck(x) ? `<br>${x.ack ? `<span class="s-normal">● Acknowledged at ${x.ack.toLocaleTimeString()}</span>` : `<span class="s-alert">■ Not acknowledged${x.escalated ? " · escalated to crew" : ""}</span> <button class="btn ghost" data-ack="${x.n}">Acknowledge</button>`}` : ""}</li>`).join("") : '<li class="state">No alerts yet. When a status changes, the reason appears here.</li>');
    const now = Date.now();
    $("#l-rep").innerHTML = E.reports.length ? E.reports.map(r => { const left = Math.max(0, Math.ceil((r.eta - now) / 1000)); return `<li><strong>${r.id}</strong> · ${r.astro} · ${r.type}<br><span class="mut">${esc(r.why)}</span><br>${left ? `<span class="s-note">Queued: delivers in ${left} s (= ${left} min)</span>` : '<span class="s-normal">Delivered to Earth</span>'}</li>` }).join("") : '<li class="state">No reports queued. An alert creates one automatically.</li>';
    $("#l-map").innerHTML = D.crew.map(a => `<div class="mod s-${E.status[a.id].status}"><strong>${a.module}</strong><br><span class="num">${a.id}</span> ${pill(E.status[a.id].status)}</div>`).join("")
  }

  function route(nav) {
    if (!D.crew.every(a => E.hist[a.id])) return; // not booted yet (hashchange during loading)
    const [name, arg] = (location.hash.slice(1) || "overview").split("/"); const key = V[name] ? name : "overview";
    document.querySelectorAll("nav a").forEach(a => a.setAttribute("aria-current", a.dataset.v === key ? "page" : "false"));
    $("nav").classList.remove("open"); $(".menu").setAttribute("aria-expanded", "false");
    view.innerHTML = V[key](arg); view.className = "view"; document.title = "Astro·Baseline · " + key;
    if (key === "live") fillLive();
    if (nav !== false) { const h = location.hash; if (!h || h === "#top") window.scrollTo(0, 0); else $("#main").scrollIntoView() }
  }

  function refresh() {
    banner(); const k = (location.hash.slice(1) || "overview").split("/")[0];
    if (k === "live") fillLive(); else if (k === "overview") route(false); else if (k === "crew") { const a = D.crew.find(x => x.id === location.hash.split("/")[1]); const el = $("#c-status"); if (a && el) el.innerHTML = statusBlock(a) }
  }

  AB.refreshView = () => { banner(); route(false) };
  $("#banner").addEventListener("click", e => { const b = e.target.closest("button[data-ack]"); if (b) E.ack(b.dataset.ack) });
  view.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.ack) { E.ack(b.dataset.ack); return }
    if (b.dataset.sc) { E.reset(b.dataset.sc); route() }
    if (b.id === "pause") { E.toggle(); route() }
    if (b.id === "voice") { voice = !voice; if (AB.voice) AB.voice.on = voice; if (voice && !("speechSynthesis" in window)) { voice = false; toast("Voice guidance is not supported in this browser.") } route() }
  });
  view.addEventListener("change", e => { if (e.target.id !== "an") return; selAn = e.target.value; const a = D.crew.find(x => x.id === location.hash.split("/")[1]); if (a) $("#c-chart").innerHTML = chart(a) });
  view.addEventListener("submit", e => {
    e.preventDefault(); if (e.target.id !== "note") return;
    const a = $("#n-a").value, t = $("#n-t").value.trim(); let ok = true;
    $("#e-a").textContent = a ? "" : (ok = false, "Select a crew member.");
    $("#e-t").textContent = t.length < 5 ? (ok = false, "Write at least 5 characters.") : t.length > 280 ? (ok = false, "Keep it under 280 characters.") : "";
    if (ok) { E.addNote(a, t); e.target.reset(); toast("Note added to report queue.") }
  });
  function toast(m) { const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2500) }
  E.on(() => { refresh() });
  setInterval(() => { if ((location.hash || "").startsWith("#live")) fillLive() }, 1000);

  $(".menu").addEventListener("click", () => { const o = $("nav").classList.toggle("open"); $(".menu").setAttribute("aria-expanded", o) });
  window.addEventListener("hashchange", route);

  function boot() {
    view.innerHTML = '<div class="grid g4"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div><div class="state"><div class="spin"></div>Loading crew baselines…</div>';
    setTimeout(() => {
      try {
        if (!D.crew.every(a => a.hr.length === 3 && a.real && window.AB.OSDR)) throw Error("Crew data does not match the data contract.");
        E.reset(E.DEFAULT_SCENARIO); banner(); route()
      } catch (err) { view.innerHTML = `<div class="state card"><h2>Could not load crew data</h2><p>${esc(err.message)}</p><button class="btn" id="retry">Try again</button></div>`; $("#retry").onclick = boot }
    }, 500)
  }
  boot();

  $("#enter").onclick = () => $("#main").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  let tick = false; function dim() { tick = false; const vh = innerHeight, d = Math.min(1, Math.max(0, (scrollY - vh * .25) / (vh * .5))); document.documentElement.style.setProperty("--dim", d) }
  addEventListener("scroll", () => { if (!tick) { tick = true; requestAnimationFrame(dim) } }, { passive: true }); dim();
  // video: pause when hidden, skip on small/saver connections
  const v = $("#bgv"); if (v) {
    const c = navigator.connection; if (c && c.saveData || matchMedia("(prefers-reduced-motion: reduce)").matches) v.remove();
    else { document.addEventListener("visibilitychange", () => document.hidden ? v.pause() : v.play().catch(() => { })); v.play().catch(() => { }) }
  }
})();
