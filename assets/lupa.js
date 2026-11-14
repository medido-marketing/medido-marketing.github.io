// Medido · la caja de lectura. Habla con /api/start y /api/status del servidor de Lupa.
// Todo texto que viene del servidor se inserta con textContent. Si no hay servidor, ofrece escribir.
// 29/10: el informe se dibuja por bloques, por lo que el dueño hace con cada cosa:
//   1 Lo que vi (hacelo vos) · 2 Preguntale a tu agencia · 3 Lo que un navegador confirma (lo que el código sugiere)
//   4 Lo que no se ve desde afuera (el Diagnóstico) · 5 Después (segunda lectura, sesión, compartir).
(function () {
  var d = document;
  var cfgEl = d.getElementById("cfg"); if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent), J = cfg.js;
  var API = cfg.api || "";
  // las lecturas de Débora (navegador marcado con ?interno=1, ver measure.js) se cuentan aparte en los totales de Lupa
  // se lee al mandar, no al cargar: lupa.js corre antes que measure.js y en la primera visita con ?interno=1 la marca todavía no estaba
  function INT() {
    try {
      var q = location.search;
      if (/[?&]interno=0(&|$)/.test(q)) return 0;
      return (/[?&]interno=1(&|$)/.test(q) || localStorage.getItem("medido_interno") === "1") ? 1 : 0;
    } catch (e) { return 0; }
  }   // vacío: el servidor de Lupa es el mismo del sitio; con valor: el Worker de Cloudflare (otra dirección)
  // Si Google devuelve al visitante a esta portada (?google=ok|error), lo llevamos a la página de conexión de su idioma, con la misma consulta.
  if (/[?&]google=/.test(location.search)) {
    var gl = null; try { gl = sessionStorage.getItem("medido_glang"); } catch (e) {}
    var gp = { en: "/connect/", he: "/he/connect/", es: "/es/connect/" };
    location.replace((gp[gl] || gp[cfg.lang] || gp.en) + location.search); return;
  }
  var form = d.getElementById("reader"); if (!form) return;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var el = function (tag, cls, txt) { var n = d.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
  var spend = "none", lastUrl = "", busy = false;
  var reduced = false; try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  Array.prototype.forEach.call(form.querySelectorAll("[data-spend]"), function (c) {
    c.addEventListener("click", function () {
      var on = c.getAttribute("aria-pressed") !== "true";
      Array.prototype.forEach.call(form.querySelectorAll("[data-spend]"), function (x) { x.setAttribute("aria-pressed", "false"); });
      c.setAttribute("aria-pressed", on ? "true" : "false"); spend = on ? c.getAttribute("data-spend") : "none";
    });
  });

  // Con formulario activo (cfg.contact), el pedido va a la página de contacto con el texto ya armado y el modo del formulario
  // (m=help: lectura a mano, pagos, cupón; m=diag: Diagnóstico; m=hello: sesión), que lee contact.js; si no, al mail de siempre.
  function mailto(subject, bodyTxt, mode, site) {
    if (!cfg.contact) return "mailto:" + cfg.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyTxt);
    return cfg.contact + "?m=" + (mode || "help") + "&subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyTxt) + (site ? "&site=" + encodeURIComponent(site) : "");
  }
  var HELP = cfg.contact ? cfg.contact + "?m=help" : "";
  function mailBody(url, extra) { return cfg.body.replace("{url}", url).replace("{spend}", J.spend_labels[spend]) + (extra ? "\n\n" + extra : ""); }
  function note(txt, err) {
    var n = $("#formnote"); n.textContent = txt; n.classList.toggle("err", !!err);
    var inp = $("#site"); if (inp) { if (err) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid"); }
  }

  function iso(t) { return cfg.lang === "he" ? "⁦" + t + "⁩" : t; }
  function sealClass(s) { return s === "verified" ? "m-tag m-tag--ver" : s === "inferred" ? "m-tag m-tag--inf" : s === "reported" ? "m-tag m-tag--rep" : "m-tag m-tag--not"; }
  var STATE = { problem: "✕", warn: "!", ok: "✓", info: "i" };

  function show(id, on) { var n = d.getElementById(id); if (n) n.hidden = !on; }

  // La pantalla de proceso dice qué lectura es: con navegador o sin él (el servidor lo sabe; la página lo pregunta una vez).
  var stage = "";
  fetch(API + "/api/health").then(function (r) { return r.json(); }).then(function (h) {
    stage = (h && h.stage) || "";
    if (stage === "static") { var lk = $("#logk"); if (lk && J.log_k_static) lk.textContent = J.log_k_static; var wn = $("#waitnote"); if (wn && J.wait_note_static) wn.textContent = J.wait_note_static; }
  }).catch(function () {});

  // Link permanente: ?r=<id> dibuja la lectura ya hecha, tal cual, sin pedir nada nuevo (el Worker la guarda 30 días; Débora, 4/11).
  try { var rp = new URLSearchParams(location.search).get("r"); if (rp && /^[0-9a-f]{12,32}$/.test(rp)) {
    fetch(API + "/api/reading/" + rp + ".json").then(function (x) { if (!x.ok) throw new Error("gone"); return x.json(); }).then(function (r) { lastUrl = r.url || ""; $("#site").value = r.url || ""; emit("pql_reading_requested", { via: "permanent_link" }); render(r); }).catch(function () { /* vencida o inexistente: queda la portada */ });
  } } catch (e) {}
  // Enlace compartido viejo: ?site=... arranca la lectura al abrir la página (misma caché del Worker: no gasta una lectura nueva dentro de las 6 horas).
  try { var sp = new URLSearchParams(location.search), qs = sp.get("site"); if (qs && !sp.get("r")) { $("#site").value = qs; setTimeout(function () { lastUrl = qs; if (!sp.get("re")) emit("pql_reading_requested", { via: "shared_link" }); start(qs); }, 50); } } catch (e) {}
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    var url = ($("#site").value || "").trim();
    if (!url) { note(J.empty, true); return; }
    lastUrl = url; emit("pql_reading_requested"); start(url);
  });

  // Turnstile (opcional): si la configuración trae una clave pública, la persona se verifica antes de pedir la lectura.
  // El desafío es "solo si hace falta": casi siempre no muestra nada. Sin clave, no se carga nada de Cloudflare.
  var tsWidget = null, tsPending = null;
  function tsDone(t) { if (!tsPending) return; var p = tsPending; tsPending = null; clearTimeout(p.timer); try { window.turnstile.reset(tsWidget); } catch (e) {} p.ok(t); }
  function tsFail() { if (!tsPending) return; var p = tsPending; tsPending = null; clearTimeout(p.timer); p.no(new Error("turnstile")); }
  function loadTurnstile() {
    return new Promise(function (ok, no) {
      if (window.turnstile) return ok();
      var sc = d.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true;
      sc.onload = function () { ok(); }; sc.onerror = function () { no(new Error("turnstile")); }; d.head.appendChild(sc);
    });
  }
  function getToken() {
    if (!cfg.sitekey) return Promise.resolve("");
    return loadTurnstile().then(function () {
      return new Promise(function (ok, no) {
        tsPending = { ok: ok, no: no, timer: setTimeout(tsFail, 20000) };
        var host = d.getElementById("ts"); if (!host) { host = el("div"); host.id = "ts"; form.appendChild(host); }
        if (tsWidget === null) tsWidget = window.turnstile.render(host, { sitekey: cfg.sitekey, appearance: "interaction-only", execution: "execute", callback: tsDone, "error-callback": tsFail });
        window.turnstile.execute(tsWidget);
      });
    });
  }

  function start(url) {
    busy = true; $("#go").disabled = true; note("", false);
    d.querySelectorAll(".m-seg [data-go]").forEach(function (b) { b.setAttribute("data-site", url); });
    show("idle", false); show("progress", true); show("result", false); d.body.classList.add("is-reading"); d.body.classList.remove("has-result");
    beginLog();
    // si Turnstile no carga o no verifica, se pregunta igual sin la ficha: el servidor contesta «no pude confirmar que eres
    // una persona» en el idioma de la página (antes salía «la lectura en vivo todavía no funciona en este servidor», que no era cierto)
    getToken().catch(function () { return ""; }).then(function (token) {
      return fetch(API + "/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url, lang: cfg.lang, token: token, interno: INT() }) });
    })
      .then(function (r) { return r.json().catch(function () { return { error: "?" }; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (o) {
        if (o.status === 404 || o.status === 405 || o.status === 501) return offline(url);
        if (o.j.needs_coupon) return askCoupon(o.j);
        if (o.j.error) return o.j.contact ? failContact(o.j.error) : fail(o.j.error);
        follow(o.j.id);
      })
      .catch(function () { offline(url); });
  }
  // La lectura corre dentro de este pedido, que queda abierto hasta que termina (un trabajo en segundo plano se cancelaría a los 30 s).
  function follow(id) {
    fetch(API + "/api/run?id=" + encodeURIComponent(id), { method: "POST" }).catch(function () {});
    poll(id, 0);
  }
  // Lo que pasa con la lectura (copiarla, compartirla, guardar el cupón) se suma al registro del sitio, sin datos de quien lo hace.
  // Va como texto simple (sin consulta previa del navegador), para que llegue aunque la página se cierre enseguida.
  function siteEvent(name, url) {
    try { fetch(API + "/api/event", { method: "POST", keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ url: url || lastUrl, name: name, lang: cfg.lang, interno: INT() }) }).catch(function () {}); } catch (e) {}
  }
  function contactLink(p) { if (cfg.contact) { p.appendChild(d.createTextNode(" ")); var a = el("a", null, J.offline_btn); a.href = HELP; p.appendChild(a); } return p; }
  function failContact(msg) { back(); note(msg, true); contactLink($("#formnote")); }

  // La misma lectura otra vez (dentro de las 6 horas): la rueda llega enseguida al 100 % y, donde va el registro de pasos,
  // se dice cuánto hace que se hizo, cuánto queda guardada, que la Segunda lectura es con el cupón, y la sesión de 45 minutos.
  function repeatPanel(r) {
    var ring = $("#ring"); if (ring) ring.style.setProperty("--p", 100);
    var pct = $("#ringpct"); if (pct) pct.textContent = "100 %";
    var st = $("#step"); if (st) st.textContent = "";
    var log = $("#log"); if (!log) return; log.hidden = false;
    var lk = $("#logk"), sp = $("#steps"); if (lk) lk.hidden = true; if (sp) sp.hidden = true;   // el registro de pasos queda, oculto, para la próxima lectura
    var wn = $("#waitnote"); if (wn) wn.hidden = true;                                       // «un navegador real…» no aplica: no se leyó de nuevo
    var t = r.repeat.t, box = el("div", "repeat"); box.style.display = "grid"; box.style.gap = "16px"; box.style.alignContent = "start";
    box.appendChild(el("p", "t-title", t.ago));
    if (r.coupon && r.coupon.open) box.appendChild(el("p", "t-body", t.next));
    var bk = cfg.booking || {}, url = r.url || lastUrl;
    if (bk.talk && bk.note) {
      box.appendChild(el("p", "t-label", t.hard));
      var row = el("div", "cta-row");
      [["talk", J.meet_btn_talk, "m-btn m-btn--filled"], ["note", J.meet_btn_note, "m-btn m-btn--outlined"]].forEach(function (o) {
        var a = el("a", o[2], o[1]); a.href = bk[o[0]] + "?site=" + encodeURIComponent(url); a.target = "_blank"; a.rel = "noopener";
        a.addEventListener("click", function () { emit("meeting_requested", { option: o[0], via: "repeat" }); }); row.appendChild(a);
      });
      box.appendChild(row);
    }
    log.appendChild(box);
    emit("reading_repeated");
  }

  // El cupón se recuerda en este navegador (solo el código y su vencimiento, por sitio), para no tener que escribirlo al volver.
  // No es un dato de la persona ni sirve para medir: si el navegador no deja guardar, todo funciona igual escribiéndolo.
  var CP_KEY = "medido_cupones";
  function cpAll() { try { var o = JSON.parse(localStorage.getItem(CP_KEY) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } }
  function cpSave(o) { try { localStorage.setItem(CP_KEY, JSON.stringify(o)); } catch (e) {} }
  function cpSite(u) { return hostOf(u || "").replace(/^www\./, "").toLowerCase(); }
  function cpKeep(u, c) {
    var o = cpAll(), k = cpSite(u), now = Date.now();
    for (var x in o) if (!o[x] || !(Date.parse(o[x].exp + "T23:59:59Z") > now)) delete o[x];   // los vencidos se van solos
    if (k && c && c.code && c.open) o[k] = { code: c.code, exp: c.expires };
    else if (k) delete o[k];                                                                       // usado o sin cupón: se olvida
    cpSave(o);
  }
  function cpGet(u) { var v = cpAll()[cpSite(u)]; return v && Date.parse(v.exp + "T23:59:59Z") > Date.now() ? v.code : ""; }

  // ---------- Segunda lectura: el cupón y el pago (PayPal, por redirección) ----------
  // Un sitio ya leído, pasadas las 6 horas y con el cupón vigente: se pide el cupón y el pago de US$5.
  function askCoupon(j) {
    busy = false; $("#go").disabled = false; show("progress", false); show("idle", false); d.body.classList.add("is-reading");
    var root = $("#result-in"); root.textContent = "";
    var box = el("div", "m-card askcp"); box.appendChild(el("h2", "t-headline", j.t.h)); box.appendChild(el("p", "t-body", j.t.p));
    var f = el("form", "askform"), lab = el("label", "t-label", j.t.label), inp = el("input"); inp.type = "text"; inp.id = "cpcode"; inp.autocomplete = "off"; inp.spellcheck = false; inp.dir = "ltr"; inp.maxLength = 12; inp.placeholder = "XXXX-XXXX";
    lab.htmlFor = "cpcode"; var go = el("button", "m-btn m-btn--filled", j.t.btn); go.type = "submit";
    inp.value = cpGet(j.url || lastUrl);                                             // el que este navegador recuerda, si lo hay
    var msg = el("p", "t-note"); msg.setAttribute("role", "status");
    var bar = el("div", "m-search"); bar.appendChild(inp); bar.appendChild(go);
    f.appendChild(lab); f.appendChild(bar);
    f.addEventListener("submit", function (e) { e.preventDefault(); var code = (inp.value || "").trim(); if (!code) { inp.focus(); return; } msg.textContent = j.t.check; msg.classList.remove("err"); go.disabled = true; payStart(j.url, code, msg, function () { go.disabled = false; }); });
    box.appendChild(f); box.appendChild(msg);
    var lost = el("p", "t-support"); var la = el("a", null, j.t.lost); la.href = HELP || ("mailto:" + cfg.email); lost.appendChild(la); box.appendChild(lost);
    root.appendChild(box); show("result", true);
    try { inp.focus({ preventScroll: true }); } catch (e) {}
    emit("coupon_asked");
  }
  // Valida el cupón en el servidor y manda a pagar a PayPal; PayPal devuelve a esta portada con ?pp=1&token=<orden>.
  function payStart(url, code, msg, done) {
    fetch(API + "/api/pay/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url, code: code, lang: cfg.lang, back: location.origin + location.pathname, interno: INT() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (j.approve) { emit("coupon_payment_started"); location.href = j.approve; return; }
        msg.textContent = j.error || "?"; msg.classList.add("err"); done();   // el enlace al formulario ya está debajo
      })
      .catch(function () { msg.textContent = J.offline; msg.classList.add("err"); done(); });
  }
  // De vuelta de PayPal: el servidor cobra la orden, comprueba el pago y arranca la Segunda lectura.
  // (Con setTimeout, como el enlace compartido: el registro de pasos se arma más abajo en este archivo.)
  setTimeout(function () {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    var pp = q.get("pp"), order = q.get("token");
    if (!pp) return;
    try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    if (pp !== "1" || !order) return;
    busy = true; $("#go").disabled = true; waitShown = false;
    show("idle", false); show("progress", true); show("result", false); d.body.classList.add("is-reading"); beginLog();
    fetch(API + "/api/pay/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: order, lang: cfg.lang, interno: INT() }) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (!j.id) return j.contact ? failContact(j.error || "?") : fail(j.error || "?");
        lastUrl = j.url || ""; $("#site").value = lastUrl; if (j.note) logLine("ev", j.note);
        emit("coupon_paid"); follow(j.id);
      })
      .catch(function () { fail(J.offline); });
  }, 0);

  // Al volver de un error, la caja de pegar vuelve a verse (is-reading la esconde): se puede reintentar.
  function back() { busy = false; $("#go").disabled = false; show("progress", false); show("log", false); show("idle", true); d.body.classList.remove("is-reading"); }
  function fail(msg) { back(); note(msg, true); }
  function offline(url) {
    back();
    var n = $("#formnote"); n.textContent = J.offline + " ";
    var a = el("a", null, J.offline_btn); a.href = mailto(cfg.subject, mailBody(url), "help", url); n.appendChild(a);
  }

  var waitShown = false;
  function poll(id, shown) {
    fetch(API + "/api/status?id=" + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (s) {
      // en la fila: cuántas lecturas hay antes y cuánto falta; si es mucho, también la lectura a mano en 48 horas. El anillo espera quieto.
      var q = d.getElementById("queue");
      if (q) {
        q.textContent = (s.queue && s.queue.text) || ""; q.hidden = !(s.queue && s.queue.text);
        if (s.queue && s.queue.manual) { q.appendChild(d.createTextNode(" " + s.queue.manual.p + " ")); var qa = el("a", null, s.queue.manual.btn); qa.href = mailto(s.queue.manual.subject, s.queue.manual.body, "help", lastUrl); q.appendChild(qa); }
      }
      if (s.queue && s.queue.wait && !waitShown && !s.steps.length) { logLine("wait", s.queue.wait); waitShown = true; }   // «wait»: sin tilde, que en el sistema quiere decir «hecho»
      while (shown < s.steps.length) { addStep(s.steps[shown], shown + 1); shown++; }
      if (s.done) {
        if (s.error) return s.contact ? failContact(s.error) : fail(s.error);
        if (s.result && s.result.repeat) { repeatPanel(s.result); busy = false; $("#go").disabled = false; setTimeout(function () { render(s.result); }, 600); return; }
        finishLog(s.result);
        busy = false; $("#go").disabled = false;
        setTimeout(function () { render(s.result); }, 900); return;
      }
      setTimeout(function () { poll(id, shown); }, 800);
    }).catch(function () { setTimeout(function () { poll(id, shown); }, 1500); });
  }

  // ---------- el proceso: registro a la izquierda, anillo a la derecha ----------
  var STEPS_TOTAL = 7, t0 = 0, logTimers = [];
  function beginLog() {
    logTimers.forEach(clearTimeout); logTimers = [];
    t0 = Date.now(); $("#steps").textContent = ""; show("log", true);
    var rp = $("#log .repeat"); if (rp) rp.remove(); show("logk", true); show("steps", true); show("waitnote", true);
    var ring = $("#ring"); if (ring) ring.style.setProperty("--p", 0);
    var pct = $("#ringpct"); if (pct) pct.textContent = "0 %";
    var st = $("#step"); if (st) st.textContent = "";
  }
  function logLine(cls, txt, t) {
    var ln = el("div", "ln" + (cls ? " " + cls : "")); var tm = el("span", "t", (t == null ? (Date.now() - t0) / 1000 : t).toFixed(1) + "s"); tm.dir = "ltr"; ln.appendChild(tm); ln.appendChild(el("span", null, txt));
    var box = $("#steps"); box.appendChild(ln); requestAnimationFrame(function () { ln.classList.add("on"); }); box.scrollTop = box.scrollHeight;
  }
  function addStep(text, n, t) {
    logLine("", text, t);
    var p = Math.min(100, Math.round(n / STEPS_TOTAL * 100));
    var ring = $("#ring"); if (ring) ring.style.setProperty("--p", p);
    var pct = $("#ringpct"); if (pct) pct.textContent = p + " %";
    var st = $("#step"); if (st) st.textContent = text;
  }
  function finishLog(r) {
    if (r && r.main) r.main.forEach(function (f) {
      if (f.evidence && f.evidence.length) f.evidence.slice(0, 3).forEach(function (e) { logLine("ev", e); });
      else logLine("no", f.title);
    });
    var ring = $("#ring"); if (ring) ring.style.setProperty("--p", 100);
    var pct = $("#ringpct"); if (pct) pct.textContent = "100 %";
  }
  // Reproducción de la lectura grabada del sitio demo: los mismos pasos y tiempos que devolvió el motor, al tiempo real.
  var ex = d.getElementById("explay");
  if (ex && cfg.demo) ex.addEventListener("click", function () {
    if (busy) return; busy = true; $("#go").disabled = true; note("", false);
    show("idle", false); show("progress", true); show("result", false); d.body.classList.add("is-reading"); d.body.classList.remove("has-result"); beginLog();
    var D = cfg.demo, last = D.timeline[D.timeline.length - 1].t;
    D.timeline.forEach(function (s, i) { logTimers.push(setTimeout(function () { addStep(s.step, i + 1, s.t); }, s.t * 1000)); });
    logTimers.push(setTimeout(function () {
      finishLog(D.result); busy = false; $("#go").disabled = false;
      setTimeout(function () { render(D.result); }, 900);
    }, (last + 0.4) * 1000));
    emit("example_played");
  });

  // ---------- qué dice el informe: hechos, pistas del código y preguntas ----------
  var ORDER = { problem: 0, warn: 1, info: 2, ok: 3 };
  function findBy(list, id) { for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i]; return null; }
  // Pistas del código (bloque 3). Una lectura guardada con el formato anterior trae las dos tarjetas-pregunta: pasan a pistas.
  function hintsOf(r) {
    if (r.code_hints) return r.code_hints;
    var dup = findBy(r.main, "dup"), clk = findBy(r.main, "click");
    var h = { note: "", dup: null, click: null, legacy: true };
    if (dup && dup.seal === "not_seen") h.dup = { id: "dup", title: dup.title, seal: dup.seal, seal_label: dup.seal_label, state: dup.state, text: dup.sentence, evidence: dup.evidence || [], check: dup.check || [] };
    if (clk && clk.seal === "not_seen") h.click = { id: "click", title: clk.title, seal: clk.seal, seal_label: clk.seal_label, state: clk.state, text: clk.sentence, evidence: clk.evidence || [], check: clk.check || [] };
    return (h.dup || h.click) ? h : null;
  }
  // Hechos del bloque 1: las tarjetas principales más lo que antes iba plegado en "más de lo que vi", todo por gravedad.
  function facts(r) {
    var h = hintsOf(r), out = [];
    (r.main || []).forEach(function (f) { if (h && h.legacy && f.seal === "not_seen" && (f.id === "dup" || f.id === "click")) return; out.push(f); });
    (r.more || []).forEach(function (m) { out.push({ id: m.id, title: m.title, state: m.state, sentence: m.text, evidence: m.evidence || [], why: m.why || "", action: m.action || "", agency: m.agency || "", check: [], seal: m.seal || "", seal_label: m.seal_label || "", lite: true }); });
    out.sort(function (a, b) { return (ORDER[a.state] == null ? 9 : ORDER[a.state]) - (ORDER[b.state] == null ? 9 : ORDER[b.state]); });
    return out;
  }
  function readingText(r) {
    var lines = [J.reading_of + " " + r.url, r.date + " · " + r.point_of_view, "", r.headline, "", J.b1_h + ":"];
    facts(r).forEach(function (f) { lines.push("[" + (f.seal_label || J[f.state] || f.state) + "] " + f.title); lines.push(f.sentence); if (f.why) lines.push(J.lab_why + ": " + f.why); if (f.action) lines.push(J.lab_do + ": " + f.action); lines.push(""); });
    var h = hintsOf(r);
    if (h) { lines.push(J.b3_h + ":"); if (h.note) lines.push(h.note); [h.dup, h.click].forEach(function (x) { if (x) lines.push("[" + x.seal_label + "] " + x.title + ": " + x.text); }); lines.push(""); }
    lines.push(J.b4_h + ":"); (r.cant_see || []).forEach(function (c) { lines.push("- " + c.title + ": " + c.text); });
    return lines.join("\n");
  }

  // ---------- piezas ----------
  // Textos nuevos del informe (variante A, 4/11): vienen de J.rp_* (content.py). Estos son los de respaldo en inglés, para probar sin ellos;
  // el botón de PDF solo se muestra si J.rp_pdf existe (Web lo enciende junto con los estilos de impresión).
  var RP = {
    rp_pdf: "Download PDF", rp_pdf_all: "Download the full reading (PDF)", rp_pdf_note: "The rest of the reading (what can't be seen from outside, what changed, what comes next) is in the PDF.",
    rp_size: "The real size", rp_sum: "{n} checks: {ok} in order, {act} to act on, {know} to know.", rp_price_note: "US$925 · the reading above stays free",
    rp_ok_k: "In order · {n}", rp_ok_h: "What is in order", rp_fix_k: "To fix first", rp_warn_k: "Worth a look", rp_know_k: "To know · {n}", rp_know_h: "What I saw, without a verdict",
    rp_check_n: "Check it yourself · {n} steps", rp_diag_k: "The Diagnosis", rp_cant_k: "Not visible from outside", rp_after_k: "Afterwards",
    rp_inv_h: "Want to go through this report together?", rp_inv_p: "I can read it with you, or send you the detailed steps to fix what I found. The steps are requested, not bought.", rp_inv_read: "Read the report with me", rp_inv_steps: "Request the detailed steps",
    rp_perma: "Permanent link", rp_free: "The reading above stays free and complete whether you ask or not."
  };
  function X(k, v) { var s = J[k] != null ? J[k] : (RP[k] || ""); if (v) for (var p in v) s = s.split("{" + p + "}").join(v[p]); return s; }
  var PDF_ON = J.rp_pdf != null;

  // Hebreo (RTL): lo que va en letras latinas dentro de una frase (identificadores, eventos, direcciones, fechas) se aísla con <bdi> para que no se desordene.
  var BDI_RX = /\b(?:G|AW|GTM|UA|GT)-[A-Z0-9][A-Z0-9-]{3,}\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;)"]*)?|\b\d{4}-\d{2}-\d{2}\b|\bGA4\b/gi;
  function rich(node, text) {
    text = String(text == null ? "" : text);
    if (cfg.lang !== "he") { node.appendChild(d.createTextNode(text)); return node; }
    var last = 0, m; BDI_RX.lastIndex = 0;
    while ((m = BDI_RX.exec(text))) { if (m.index > last) node.appendChild(d.createTextNode(text.slice(last, m.index))); node.appendChild(el("bdi", null, m[0])); last = m.index + m[0].length; }
    if (last < text.length) node.appendChild(d.createTextNode(text.slice(last)));
    return node;
  }
  function elr(tag, cls, txt) { return rich(el(tag, cls), txt); }
  function sign(state) { return el("span", "rp-sg rp-sg-" + state, STATE[state] || "i"); }
  function sealTag(f) { return f.seal ? el("span", sealClass(f.seal), f.seal_label) : null; }
  function evidence(f) {
    if (!(f.evidence && f.evidence.length)) return null;
    var ev = el("p", "rp-evs"); f.evidence.slice(0, 4).forEach(function (e) { var s = el("span", "rp-ev", iso(e)); ev.appendChild(s); }); return ev;
  }
  function stepsOl(list) { var ol = el("ol", "rp-stp"); list.forEach(function (s) { ol.appendChild(elr("li", null, s)); }); return ol; }
  // ¿Es correcto? (sí / no / no sé): se suma al conteo de aciertos del Worker
  function feedback(f) {
    if (!(f.id && window.__readId)) return null;
    var fb = el("div", "rp-ok3"); fb.setAttribute("aria-live", "polite"); fb.appendChild(el("span", "t-note", J.fb_q));
    var chips = el("span", "rp-chips");
    [["correct", J.fb_yes], ["incorrect", J.fb_no], ["unknown", J.fb_unk]].forEach(function (p) {
      var b2 = el("button", "m-chip", p[1]); b2.type = "button";
      b2.addEventListener("click", function () {
        fetch(API + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read_id: window.__readId, finding: f.id, verdict: p[0] }) }).catch(function () {});
        fb.textContent = ""; fb.appendChild(el("span", "t-note", J.fb_thanks));
      });
      chips.appendChild(b2);
    });
    fb.appendChild(chips); return fb;
  }
  function block(cls, kicker, title) {
    var b = el("section", "rp-blk " + (cls || ""));
    if (kicker || title) { var h = el("header", "rp-bh"); if (kicker) h.appendChild(el("p", "t-label", kicker)); if (title) h.appendChild(el("h3", "t-title", title)); b.appendChild(h); }
    return b;
  }
  function pdfButton(cls, label) {
    if (!PDF_ON) return null;
    var b = el("button", cls, label); b.type = "button";
    b.addEventListener("click", function () {
      var host = hostOf((lastResult && lastResult.url) || lastUrl), old = d.title;
      d.title = "Medido · " + host;                                  // el nombre con que el navegador propone guardar el PDF
      var back2 = function () { d.title = old; window.removeEventListener("afterprint", back2); };
      window.addEventListener("afterprint", back2);
      emit("pdf_downloaded"); siteEvent("pdf_downloaded", (lastResult && lastResult.url) || lastUrl);
      try { window.print(); } catch (e) { back2(); }
    });
    return b;
  }
  function diagHref(r) { var A = cfg.ask; return A ? mailto(A.ask_subject, A.ask_body.replace("{url}", r.url || lastUrl).replace("{langname}", A.lang_name).replace("{spend}", J.spend_labels[spend]), "diag", r.url || lastUrl) : ""; }

  // La banda negra: el tamaño real de la lectura (cuántas cosas se miraron y cómo salieron) y el pedido del Diagnóstico
  function summary(r, all) {
    var c = { problem: 0, warn: 0, info: 0, ok: 0 }; all.forEach(function (f) { if (c[f.state] != null) c[f.state]++; });
    var n = c.problem + c.warn + c.info + c.ok, sec = el("section", "rp-sum"); sec.setAttribute("data-surface", "negro"); sec.setAttribute("aria-label", X("rp_size"));
    var ringW = el("div", "rp-sum-ring"), ring = el("span", "m-ring"); ring.setAttribute("aria-hidden", "true"); ring.style.setProperty("--p", n ? Math.round(c.ok / n * 100) : 0);
    ringW.appendChild(ring); ringW.appendChild(el("b", null, String(c.ok))); sec.appendChild(ringW);
    var tx = el("div", "rp-sum-txt");
    tx.appendChild(el("p", "t-label", X("rp_size")));
    tx.appendChild(el("p", "rp-sum-h", X("rp_sum", { n: n, ok: c.ok, act: c.problem + c.warn, know: c.info })));
    var segs = el("div", "rp-segs"); segs.setAttribute("aria-hidden", "true");
    ["problem", "warn", "info", "ok"].forEach(function (s) { for (var i = 0; i < c[s]; i++) segs.appendChild(el("i", "rp-s-" + s)); }); tx.appendChild(segs);
    var ul = el("ul", "rp-stats");
    ["problem", "warn", "info", "ok"].forEach(function (s) { var li = el("li"); li.appendChild(sign(s)); li.appendChild(el("b", null, String(c[s]))); li.appendChild(el("span", null, J[s] || s)); ul.appendChild(li); });
    tx.appendChild(ul);
    if (cfg.ask) {
      var cta = el("div", "rp-sum-cta"), a = el("a", "rp-wbtn", cfg.ask.ask_btn); a.href = diagHref(r);
      a.addEventListener("click", function () { emit("diagnosis_cta_clicked", { where: "summary" }); }); cta.appendChild(a); cta.appendChild(el("span", "rp-sum-p", X("rp_price_note"))); tx.appendChild(cta);
    }
    sec.appendChild(tx); return sec;
  }
  // Lo que está en orden: una lista visible, lo primero
  function okList(fine) {
    var b = block("rp-ok", X("rp_ok_k", { n: fine.length }), X("rp_ok_h")), ul = el("ul", "rp-list");
    fine.forEach(function (f) {
      var li = el("li", "rp-row"); li.appendChild(sign("ok"));
      var t = el("div"); t.appendChild(el("b", null, f.title)); t.appendChild(elr("span", "rp-sup", f.sentence)); li.appendChild(t);
      var st = sealTag(f); if (st) li.appendChild(st);              // cada fila con su sello (Manual de marca, 4/11); una lectura vieja sin sello no pone nada
      ul.appendChild(li);
    });
    b.appendChild(ul); return b;
  }
  // Un problema: tarjeta grande. Qué vi · para vos · qué hacer | comprobalo vos · para tu agencia · ¿es correcto?
  function problemCard(f) {
    var c = el("article", "rp-pcard"), main = el("div", "rp-pc-main"), top = el("div", "rp-pc-top"); top.appendChild(sign(f.state)); var st = sealTag(f); if (st) top.appendChild(st); main.appendChild(top);
    main.appendChild(el("h3", "rp-pc-h", f.title)); main.appendChild(elr("p", "rp-pc-s", f.sentence));
    var ev = evidence(f); if (ev) main.appendChild(ev);
    if (f.why) { var w = el("blockquote", "rp-why"); w.appendChild(el("span", "t-label", J.lab_why)); rich(w, f.why); main.appendChild(w); }
    if (f.action) { var dd = el("div", "rp-do"); dd.appendChild(el("span", "t-label", J.lab_do)); dd.appendChild(elr("p", null, f.action)); if (f.state !== "ok") dd.appendChild(el("p", "t-note", J.do_reread)); main.appendChild(dd); }
    c.appendChild(main);
    var side = el("div", "rp-pc-side");
    if (f.check && f.check.length) { side.appendChild(el("p", "t-label", X("rp_check_n", { n: f.check.length }))); side.appendChild(stepsOl(f.check)); }
    var fb = feedback(f); if (fb) side.appendChild(fb);
    if (side.childNodes.length) c.appendChild(side);
    return c;
  }
  // A revisar: tarjeta punteada, escala media. Un hallazgo inferido ya trae su titular en forma de pregunta (lo decide el Worker).
  function warnCard(f) {
    var c = el("article", "rp-wcard"), top = el("div", "rp-wc-top"); top.appendChild(sign(f.state)); var st = sealTag(f); if (st) top.appendChild(st); c.appendChild(top);
    c.appendChild(el("h3", "t-title", f.title)); c.appendChild(elr("p", "t-body", f.sentence));
    var ev = evidence(f); if (ev) c.appendChild(ev);
    if (f.why) { var w = el("p", "t-support"); w.appendChild(el("b", null, J.lab_why + ": ")); rich(w, f.why); c.appendChild(w); }
    if (f.action) { var dd = el("p", "t-support"); dd.appendChild(el("b", null, J.lab_do + ": ")); rich(dd, f.action); c.appendChild(dd); c.appendChild(el("p", "t-note", J.do_reread)); }
    if (f.check && f.check.length) { var dt = el("details", "rp-det"); dt.appendChild(el("summary", null, J.check)); dt.appendChild(stepsOl(f.check)); c.appendChild(dt); }
    var fb = feedback(f); if (fb) c.appendChild(fb);
    return c;
  }
  // Para saber: tarjeta chica, sin veredicto; cómo comprobarlo y qué preguntar, plegado
  function infoCard(f) {
    var c = el("article", "rp-icard"), top = el("div", "rp-ic-top"); top.appendChild(sign(f.state)); var st = sealTag(f); if (st) top.appendChild(st); c.appendChild(top); c.appendChild(el("h4", null, f.title)); c.appendChild(elr("p", "t-support", f.sentence));
    var ev = evidence(f); if (ev) c.appendChild(ev);
    if (f.why) c.appendChild(elr("p", "t-support", J.lab_why + ": " + f.why));
    if (f.action) c.appendChild(elr("p", "t-support", J.lab_do + ": " + f.action));
    if (f.check && f.check.length) { var dt = el("details", "rp-det"); dt.appendChild(el("summary", null, J.check)); dt.appendChild(stepsOl(f.check)); c.appendChild(dt); }
    var fb = feedback(f); if (fb) c.appendChild(fb);
    return c;
  }
  // Pistas del código (solo cuando esta lectura no abrió un navegador): como "a revisar", con el sello inferido o "no lo vi"
  function hintCard(h) { return warnCard({ id: h.id, state: h.state, seal: h.seal, seal_label: h.seal_label, title: h.title, sentence: h.text, evidence: h.evidence, check: h.check }); }

  // Lo que no se ve desde afuera + el Diagnóstico (solo computadora)
  function cantSee(r) {
    var access = [], never = [];
    (r.cant_see || []).forEach(function (c, i) { var grp = c.group || (i < 4 ? "access" : "never"); (grp === "never" ? never : access).push(c); });
    var b = block("rp-cant rp-desk", X("rp_cant_k"), J.b4_h);
    if (access.length) {
      b.appendChild(el("p", "t-support", J.b4_access));
      var g = el("div", "rp-dcs"); access.forEach(function (c) { var a = el("article", "m-datacard"); a.appendChild(el("h4", null, c.title)); a.appendChild(elr("p", "t-support", c.text)); g.appendChild(a); }); b.appendChild(g);
    }
    if (never.length) {
      var nv = el("p", "t-note rp-nev"); nv.appendChild(el("b", null, J.b4_never + " "));
      never.forEach(function (c, i) { if (i) nv.appendChild(d.createTextNode(" · ")); nv.appendChild(el("b", null, c.title)); rich(nv, " (" + c.text.replace(/\.$/, "") + ")"); });
      b.appendChild(nv);
    }
    if (cfg.ask) {
      var dg = el("div", "rp-diag"), l = el("div"); l.appendChild(el("p", "t-label", X("rp_diag_k"))); l.appendChild(el("p", "rp-diag-p", J.b4_diag)); dg.appendChild(l);
      var rr = el("div", "rp-diag-r"), a = el("a", "m-btn m-btn--filled", cfg.ask.ask_btn); a.href = diagHref(r); a.addEventListener("click", function () { emit("diagnosis_cta_clicked", { where: "card" }); }); rr.appendChild(a);
      if (cfg.diag_href) { var dl = el("a", "rp-lnk", J.b4_link); dl.href = cfg.diag_href; rr.appendChild(dl); }
      dg.appendChild(rr); b.appendChild(dg); b.appendChild(el("p", "t-note", X("rp_free")));
    }
    return b;
  }
  // Invitación (Débora, 5/11), en el lugar de las preguntas para la agencia: leer el informe con ella, o pedir los pasos detallados para solucionar
  // (se piden, no se compran: formulario de contacto en modo «steps», con el sitio y la lectura). Reemplaza también la tarjeta de próximos pasos.
  function invite(r) {
    var host = hostOf(r.final_url || r.url || lastUrl).replace(/^www\./, ""), c = el("section", "rp-invite m-card m-card--accent"), row = el("div", "cta-row");
    c.appendChild(el("h3", "t-title", X("rp_inv_h"))); c.appendChild(el("p", "t-body", X("rp_inv_p")));
    if (cfg.contact) {
      var a = el("a", "m-btn m-btn--filled", X("rp_inv_steps")); a.href = cfg.contact + "?m=steps&site=" + encodeURIComponent(host) + (r.read_id ? "&r=" + encodeURIComponent(r.read_id) : "");
      a.addEventListener("click", function () { siteEvent("steps_cta_clicked", r.url); emit("next_step_clicked", { option: "steps" }); }); row.appendChild(a);   // un solo evento por botón (Medición, 5/11)
    }
    var bk = cfg.booking || {}, url = r.url || lastUrl, rd;
    if (bk.talk) { rd = el("a", "m-btn m-btn--outlined", X("rp_inv_read")); rd.href = bk.talk + "?site=" + encodeURIComponent(url); rd.target = "_blank"; rd.rel = "noopener"; rd.addEventListener("click", function () { emit("next_step_clicked", { option: "read_together" }); emit("meeting_requested", { via: "report" }); }); }   // meeting_requested es evento clave (paso 4 del embudo)
    else if (cfg.contact) { rd = el("a", "m-btn m-btn--outlined", X("rp_inv_read")); rd.href = mailto(J.meet_subject.replace("{host}", host), J.meet_body.replace("{host}", host).replace("{url}", url), "hello", url); rd.addEventListener("click", function () { emit("next_step_clicked", { option: "read_together" }); emit("meeting_requested", { via: "report" }); }); }
    if (rd) row.appendChild(rd);
    c.appendChild(row); return c;
  }
  // «Qué cambió» (J.changes_*): con Segunda lectura va justo después de «Lo que desbloqueaste»; en una lectura que se repite sin pagar, en la franja del final
  function changesCard(r) {
    var chg = el("article", "rp-chg m-card"); chg.appendChild(el("h4", null, J.changes_h + (r.previous && r.previous.date ? " (" + iso(r.previous.date) + ")" : "")));
    if (!r.previous.changes.length) chg.appendChild(el("p", "t-support", J.changes_none));
    else {
      var cl = el("ul"); r.previous.changes.forEach(function (c) {
        var t = c.what + ": ", raw = function (v) { return typeof v === "string" ? v : JSON.stringify(v); };
        if (c.added || c.removed) t += (c.added && c.added.length ? "+ " + c.added.join(", ") + " " : "") + (c.removed && c.removed.length ? "− " + c.removed.join(", ") : "");
        else t += raw(c.from) + " → " + raw(c.to);
        cl.appendChild(elr("li", "t-mono", t));
      }); chg.appendChild(cl);
    }
    return chg;
  }
  // La franja del final: solo cuando hay una lectura anterior y no es una Segunda lectura; solo en computadora salvo que traiga cambios. La primera lectura no la lleva.
  function strip(r) {
    if (!r.previous || r.second) return null;
    var s = el("section", "rp-strip" + (r.previous.changes.length ? "" : " rp-desk")); s.appendChild(changesCard(r)); return s;
  }
  // Segunda lectura pendiente (pagó y el navegador no estuvo): va ARRIBA de todo el informe, en computadora y en celular
  function pendingCard(r) { var sp = el("article", "rp-pend m-card"); sp.appendChild(el("h4", null, r.second_pending.h)); sp.appendChild(el("p", "t-support", r.second_pending.p)); return sp; }
  // La Segunda lectura comparada: lo que se desbloqueó, mejoró o se rompió (se ve en celular también: es lo que la persona pagó)
  function secondBox(r) {
    var un = el("section", "rp-second m-card m-card--accent"); un.appendChild(el("h3", "t-title", r.second.t.h)); un.appendChild(el("p", "t-body", r.second.t.lead));
    var list = function (arr, mark) { var ul = el("ul", "rp-cantlist"); arr.forEach(function (x) { ul.appendChild(el("li", null, mark + " " + x)); }); un.appendChild(ul); };
    if (r.second.unlocked.length) list(r.second.unlocked, "✓");
    if (r.second.better && r.second.better.length && r.second.t.better) { un.appendChild(el("p", "t-body", r.second.t.better)); list(r.second.better, "↗"); }
    if (r.second.worse && r.second.worse.length && r.second.t.worse) { un.appendChild(el("p", "t-body", r.second.t.worse)); list(r.second.worse, "✕"); }
    var nxp = el("p", "t-body"); nxp.appendChild(el("b", null, r.second.t.next)); un.appendChild(nxp); return un;
  }
  // Compartir: el enlace abre esta misma lectura, ya hecha, durante 30 días (?r=id); sin id (lecturas viejas), el de antes
  function shareLink(r) { return location.origin + location.pathname + (r.read_id ? "?r=" + encodeURIComponent(r.read_id) : "?site=" + encodeURIComponent(r.url || lastUrl)); }
  function shareButton(r) {
    var host = hostOf(r.url || lastUrl), link = shareLink(r), b = el("button", "m-btn m-btn--outlined", J.share); b.type = "button";
    b.addEventListener("click", function () {
      var text = J.share_text.replace("{host}", host);
      if (navigator.share) { navigator.share({ title: J.share_subject.replace("{host}", host), text: text, url: link }).then(function () { emit("reading_shared", { how: "native" }); }).catch(function () {}); }
      else { window.medidoCopy(text + " " + link, b, J.copied); emit("reading_shared", { how: "copy" }); }
      siteEvent("shared", r.url);
    });
    return b;
  }

  var lastResult = null;
  function render(r) {
    lastResult = r;
    if (r.coupon && !r.recorded) cpKeep(r.url || lastUrl, r.coupon);
    window.__readId = r.read_id || null;
    var root = $("#result-in"); root.textContent = "";
    var rep = el("div", "rp-rep"); root.appendChild(rep);
    var host = ""; try { host = new URL(r.final_url || r.url).hostname; } catch (e) {}

    // 1 · cabecera: de dónde y cuándo se leyó; Compartir y Descargar a un lado
    var head = el("header", "rp-head"), meta = el("div", "rp-head-meta");
    meta.appendChild(el("p", "t-label", J.reading_of + " " + host));
    meta.appendChild(el("p", "t-mono", iso(r.date) + " · " + J.pov + ": " + r.point_of_view + " · " + r.loads + " " + (r.loads === 1 && J.loads_label_one ? J.loads_label_one : J.loads_label) + " · " + iso(r.elapsed + " s")));
    if (r.recorded) meta.appendChild(el("p", "t-note", J.ex_recorded.replace("{date}", r.date)));
    else if (r.cached) meta.appendChild(el("p", "t-note", r.cached_note || J.cached));
    head.appendChild(meta);
    if (!r.unreadable) { var act = el("div", "rp-head-act"); act.appendChild(shareButton(r)); var pb = pdfButton("m-btn m-btn--outlined", X("rp_pdf")); if (pb) act.appendChild(pb); head.appendChild(act); }
    rep.appendChild(head);
    if (r.second_pending) rep.appendChild(pendingCard(r));

    if (r.unreadable) {
      var u = el("div", "unread m-card"); u.appendChild(el("h2", "t-headline", J.unreadable_h));
      [[J.unreadable_cause, r.unreadable.cause], [J.unreadable_tried, r.unreadable.tried], [J.unreadable_needs, r.unreadable.needs]].forEach(function (p) { u.appendChild(el("p", "t-label", p[0])); u.appendChild(el("p", "t-body", p[1])); });
      rep.appendChild(u);
      if (r.manual) {                                                                // el sitio frena a Lupa: la lectura a mano, en 48 horas
        var mt = r.manual.t, mc = el("div", "m-card m-card--accent manual");
        mc.appendChild(el("h3", "t-title", mt.h)); mc.appendChild(el("p", "t-body", mt.p));
        var ma = el("a", "m-btn m-btn--filled", mt.btn); ma.href = mailto(mt.subject, mt.body, "help", r.url || lastUrl);
        ma.addEventListener("click", function () { siteEvent("manual_requested", r.url); emit("manual_requested"); });
        var mr = el("div", "cta-row"); mr.appendChild(ma); mc.appendChild(mr); rep.appendChild(mc);
      }
      rep.appendChild(endBlock(r, false)); reveal(); return;
    }

    // 2 · titular
    var hl = elr("h2", "t-display rp-hl", r.headline); hl.tabIndex = -1; rep.appendChild(hl);
    var all = facts(r), pro = all.filter(function (f) { return f.state === "problem"; }), wrn = all.filter(function (f) { return f.state === "warn"; }),
        inf = all.filter(function (f) { return f.state === "info"; }), fine = all.filter(function (f) { return f.state === "ok"; });
    // 3 · la banda negra con el tamaño real y el pedido del Diagnóstico
    rep.appendChild(summary(r, all));
    // 4 · lo que está en orden, primero
    if (fine.length) rep.appendChild(okList(fine));
    // 5 · el problema · 6 · a revisar · pistas del código (lecturas sin navegador) · 7 · para saber
    if (pro.length) { var bp = block("rp-hero", X("rp_fix_k")); pro.forEach(function (f) { bp.appendChild(problemCard(f)); }); rep.appendChild(bp); }
    var h = hintsOf(r);
    if (wrn.length || h) {
      var bw = block("rp-warn", X("rp_warn_k")); wrn.forEach(function (f) { bw.appendChild(warnCard(f)); });
      if (h) {
        if (r.checks && r.checks.browser_load === "failed") bw.appendChild(el("p", "t-support", J.b3_fallback));
        if (h.note) bw.appendChild(el("p", "t-support", h.note));
        [h.dup, h.click].forEach(function (x) { if (x) bw.appendChild(hintCard(x)); });
        var paths = el("div", "rp-paths"); paths.appendChild(el("p", "t-label", J.b3_paths_h));
        var pl = el("ol", "rp-stp"); [[J.b3_self, J.b3_self_d], [J.b3_me, J.b3_me_d]].forEach(function (p) { var li = el("li"); li.appendChild(el("b", null, p[0] + ". ")); li.appendChild(d.createTextNode(p[1])); pl.appendChild(li); });
        paths.appendChild(pl); bw.appendChild(paths);
      }
      rep.appendChild(bw);
    }
    if (inf.length) { var bi = block("rp-know", X("rp_know_k", { n: inf.length }), X("rp_know_h")), gi = el("div", "rp-icards"); inf.forEach(function (f) { gi.appendChild(infoCard(f)); }); bi.appendChild(gi); rep.appendChild(bi); }
    // 8 · preguntas para la agencia
    rep.appendChild(invite(r));                                      // en el lugar de las preguntas para la agencia
    if (r.second) { rep.appendChild(secondBox(r)); if (r.previous) rep.appendChild(changesCard(r)); }
    // 9 · lo que no se ve desde afuera (computadora) · 10 · los próximos pasos · cupón · 11 · cambios, final (computadora)
    rep.appendChild(cantSee(r));
    if (r.coupon && r.coupon.open) rep.appendChild(couponCard(r));
    if (r.keep_note && !r.recorded) { var kp = el("p", "t-note rp-keep m-card m-card--outlined"); kp.textContent = r.keep_note; rep.appendChild(kp); }
    var sb = strip(r); if (sb) rep.appendChild(sb);
    rep.appendChild(endBlock(r, true));
    // celular: de «No visible desde afuera» para abajo solo queda el botón de PDF (Débora, 4/11)
    var pb2 = pdfButton("m-btn m-btn--filled", X("rp_pdf_all"));
    if (pb2) { var bar = el("section", "rp-pdfbar"); bar.appendChild(el("p", "t-support", X("rp_pdf_note"))); bar.appendChild(pb2); rep.appendChild(bar); }
    reveal();
  }

  // El final: ¿tuvo sentido la lectura?, compartir y descargar, el enlace permanente y la sesión de 45 minutos. `desk`: solo en computadora.
  function endBlock(r, desk) {
    var nx = block("rp-end" + (desk ? " rp-desk" : ""), X("rp_after_k"), J.clear_q);
    var cr = el("span", "rp-chips");
    [["yes", J.clear_yes], ["partly", J.clear_partly], ["no", J.clear_no]].forEach(function (p) {
      var cb = el("button", "m-chip", p[1]); cb.type = "button";
      cb.addEventListener("click", function () { emit("reading_feedback", { value: p[0] }); cr.textContent = ""; cr.appendChild(el("span", "t-note", J.clear_thanks)); });
      cr.appendChild(cb);
    });
    nx.firstChild.appendChild(cr);
    var row = el("div", "rp-actions");
    if (!r.unreadable) {
      row.appendChild(shareButton(r)); var pb = pdfButton("m-btn m-btn--outlined", X("rp_pdf")); if (pb) row.appendChild(pb);
      if (r.read_id) row.appendChild(el("span", "rp-perma", X("rp_perma") + " · " + shareLink(r).replace(/^https?:\/\//, "")));
    } else {
      var a2 = el("a", "m-btn m-btn--outlined", J.diag_btn); a2.href = mailto(cfg.subject, mailBody(r.url || lastUrl, ""), "diag", r.url || lastUrl); row.appendChild(a2);
    }
    nx.appendChild(row);
    // Reunión de 45 minutos. Con Cal.com configurado (cfg.booking por idioma), la nota comparativa que elige, paga y agenda;
    // si no, el botón al formulario de contacto con el pedido armado.
    var bk = cfg.booking || {}, host = hostOf(r.url || lastUrl);
    if (bk.talk && bk.note) {
      var ul = el("ul", "rp-list rp-list--sess");
      [["talk", J.sess_talk_n, J.sess_talk_d, J.sess_talk_p], ["note", J.sess_note_n, J.sess_note_d, J.sess_note_p]].forEach(function (o) {
        var li = el("li", "rp-row"), tx = el("div"); tx.appendChild(el("b", null, o[1])); tx.appendChild(el("span", "rp-sup", o[2])); li.appendChild(tx);
        li.appendChild(el("b", "rp-pr", o[3]));
        var a = el("a", "m-btn m-btn--outlined", J.sess_book); a.href = bk[o[0]] + "?site=" + encodeURIComponent(r.url || lastUrl); a.target = "_blank"; a.rel = "noopener";
        a.addEventListener("click", function () { emit("meeting_requested", { option: o[0], via: "cal" }); }); li.appendChild(a); ul.appendChild(li);
      });
      nx.appendChild(ul);
    } else {
      var a3 = el("a", "m-btn m-btn--outlined", J.meet_btn); a3.href = mailto(J.meet_subject.replace("{host}", host), J.meet_body.replace("{host}", host).replace("{url}", r.url || lastUrl), "hello", r.url || lastUrl);
      a3.addEventListener("click", function () { emit("meeting_requested", { host_known: true, via: "form" }); }); row.appendChild(a3);
    }
    // qué te conviene según el gasto: vive en los precios, debajo de la lista (no en medio de la lectura)
    var rl = el("p", "t-support"); var ra = el("a", null, J.route_link); ra.href = "#prices"; rl.appendChild(ra); nx.appendChild(rl);
    return nx;
  }

  // El cupón de la Segunda lectura: el código bien visible, cuándo vence y UN enlace para agregar el aviso a Google Calendar
  // (plantilla pública de Google: sin iniciar sesión ni permisos). Para usarlo hay que volver, pegar el mismo sitio y se pide el cupón.
  function couponCard(r) {
    var c = r.coupon, t = c.t, url = r.url || lastUrl, host = hostOf(url);
    var card = el("section", "rp-coupon m-card m-card--accent");
    if (r.cached_note) { var again = el("p", "t-body"); again.appendChild(el("b", null, r.cached_note)); card.appendChild(again); }   // dentro de las 6 h: que se note que es la misma lectura y el mismo cupón
    card.appendChild(el("h3", "t-title rp-coupon-title", t.h));
    card.appendChild(el("p", "rp-coupon-price", t.price_line || t.price));
    card.appendChild(el("p", "t-label", t.code));
    var code = el("p", "t-headline rp-code", c.code); code.dir = "ltr"; card.appendChild(code);
    card.appendChild(el("p", "t-support", t.valid));
    card.appendChild(el("p", "t-body", t.validate));
    if (window.MedidoIcs && window.MedidoIcs.googleUrl) {
      var url2 = ""; try { url2 = window.MedidoIcs.googleUrl({ lang: cfg.lang, domain: host, now: new Date(), code: c.code }); } catch (e) {}
      if (url2) {
        var row = el("div", "cta-row"), a = el("a", "m-btn m-btn--outlined", t.cal); a.href = url2; a.target = "_blank"; a.rel = "noopener";
        a.addEventListener("click", function () { siteEvent("coupon_calendar", url); emit("coupon_calendar"); });
        row.appendChild(a); card.appendChild(row); card.appendChild(el("p", "t-note", t.cal_note));
      }
    }
    return card;
  }

  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return u; } }
  function emit(name, extra) { try { d.dispatchEvent(new CustomEvent("medido:" + name, { detail: Object.assign({ page_lang: cfg.lang }, extra || {}) })); } catch (e) {} }
  // Al terminar: el informe aparece, el foco va al titular (un lector de pantalla anuncia el titular, no 4.000 px de informe),
  // y las tarjetas entran recién cuando la vista llegó: así la coreografía se ve entera.
  function reveal() {
    show("result", true);
    if (!(lastResult && lastResult.recorded)) emit("reading_completed", { state: (lastResult && lastResult.state) || "" });
    var s = d.getElementById("result"), hl = $("#result .rp-hl");
    var go = function () { d.body.classList.add("has-result"); if (hl) { try { hl.focus({ preventScroll: true }); } catch (e) { hl.focus(); } } };
    // la misma lectura otra vez (dentro de las 6 h): la página se queda en el hero, con el aviso, el cupón y la sesión; el informe queda abajo
    if (lastResult && lastResult.repeat) { go(); return; }
    if (reduced) { s.scrollIntoView({ block: "start" }); go(); return; }
    setTimeout(function () { s.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(go, 420); }, 50);
  }
})();
