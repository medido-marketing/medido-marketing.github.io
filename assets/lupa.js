// Medido · la caja de lectura. Habla con /api/start y /api/status del servidor de Lupa.
// Todo texto que viene del servidor se inserta con textContent. Si no hay servidor, ofrece escribir.
// 29/10: el informe se dibuja por bloques, por lo que el dueño hace con cada cosa:
//   1 Lo que vi (hacelo vos) · 2 Preguntale a tu agencia · 3 Lo que un navegador confirma (lo que el código sugiere)
//   4 Lo que no se ve desde afuera (el Diagnóstico) · 5 Después (segunda lectura, sesión, compartir).
(function () {
  var d = document;
  var cfgEl = d.getElementById("cfg"); if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent), J = cfg.js;
  var API = cfg.api || "";   // vacío: el servidor de Lupa es el mismo del sitio; con valor: el Worker de Cloudflare (otra dirección)
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

  // Con formulario activo (cfg.contact), el pedido va a la página de contacto con el texto ya armado; si no, al mail de siempre.
  function mailto(subject, bodyTxt) { return (cfg.contact ? cfg.contact + "?" : "mailto:" + cfg.email + "?") + "subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyTxt); }
  function mailBody(url, extra) { return cfg.body.replace("{url}", url).replace("{spend}", J.spend_labels[spend]) + (extra ? "\n\n" + extra : ""); }
  function note(txt, err) {
    var n = $("#formnote"); n.textContent = txt; n.classList.toggle("err", !!err);
    var inp = $("#site"); if (inp) { if (err) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid"); }
  }

  function iso(t) { return cfg.lang === "he" ? "⁦" + t + "⁩" : t; }
  function sealClass(s) { return s === "verified" ? "m-tag m-tag--ver" : s === "inferred" ? "m-tag m-tag--inf" : s === "reported" ? "m-tag m-tag--rep" : "m-tag m-tag--not"; }
  var STATE = { problem: "✕", warn: "!", ok: "✓", info: "i" };
  function stateLabel(s) { var b = el("span", "stlabel st-" + s); b.appendChild(el("b", null, STATE[s] || "i")); b.appendChild(el("span", null, J[s] || s)); return b; }

  function show(id, on) { var n = d.getElementById(id); if (n) n.hidden = !on; }

  // La pantalla de proceso dice qué lectura es: con navegador o sin él (el servidor lo sabe; la página lo pregunta una vez).
  var stage = "";
  fetch(API + "/api/health").then(function (r) { return r.json(); }).then(function (h) {
    stage = (h && h.stage) || "";
    if (stage === "static") { var lk = $("#logk"); if (lk && J.log_k_static) lk.textContent = J.log_k_static; var wn = $("#waitnote"); if (wn && J.wait_note_static) wn.textContent = J.wait_note_static; }
  }).catch(function () {});

  // Enlace compartido: ?site=... arranca la lectura al abrir la página (misma caché del Worker: no gasta una lectura nueva dentro de las 6 horas).
  try { var sp = new URLSearchParams(location.search), qs = sp.get("site"); if (qs) { $("#site").value = qs; setTimeout(function () { lastUrl = qs; if (!sp.get("re")) emit("pql_reading_requested", { via: "shared_link" }); start(qs); }, 50); } } catch (e) {}
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
    getToken().then(function (token) {
      return fetch(API + "/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url, lang: cfg.lang, token: token }) });
    })
      .then(function (r) { return r.json().catch(function () { return { error: "?" }; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (o) {
        if (o.status === 404 || o.status === 405 || o.status === 501) return offline(url);
        if (o.j.error) return fail(o.j.error);
        // La lectura corre dentro de este pedido, que queda abierto hasta que termina (un trabajo en segundo plano se cancelaría a los 30 s).
        fetch(API + "/api/run?id=" + encodeURIComponent(o.j.id), { method: "POST" }).catch(function () {});
        poll(o.j.id, 0);
      })
      .catch(function () { offline(url); });
  }

  // Al volver de un error, la caja de pegar vuelve a verse (is-reading la esconde): se puede reintentar.
  function back() { busy = false; $("#go").disabled = false; show("progress", false); show("log", false); show("idle", true); d.body.classList.remove("is-reading"); }
  function fail(msg) { back(); note(msg, true); }
  function offline(url) {
    back();
    var n = $("#formnote"); n.textContent = J.offline + " ";
    var a = el("a", null, J.offline_btn); a.href = mailto(cfg.subject, mailBody(url)); n.appendChild(a);
  }

  function poll(id, shown) {
    fetch(API + "/api/status?id=" + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (s) {
      var q = d.getElementById("queue"); if (q) { q.textContent = (s.queue && s.queue.text) || ""; q.hidden = !(s.queue && s.queue.text); }
      while (shown < s.steps.length) { addStep(s.steps[shown], shown + 1); shown++; }
      if (s.done) {
        if (s.error) return fail(s.error);
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
    (r.more || []).forEach(function (m) { out.push({ id: m.id, title: m.title, state: m.state, sentence: m.text, evidence: m.evidence || [], why: m.why || "", action: m.action || "", agency: m.agency || "", check: [], seal: "", lite: true }); });
    out.sort(function (a, b) { return (ORDER[a.state] == null ? 9 : ORDER[a.state]) - (ORDER[b.state] == null ? 9 : ORDER[b.state]); });
    return out;
  }
  function questions(r) {
    var qs = [];
    facts(r).forEach(function (f) { if (f.agency) qs.push({ q: f.agency, from: f.title }); });
    return qs;
  }
  function agencyText(r) {
    var host = ""; try { host = new URL(r.url).hostname; } catch (e) {}
    var lines = [J.kit_intro.replace("{host}", host).replace("{date}", r.date), ""];
    var n = 1;
    questions(r).forEach(function (q) { lines.push(n + ". " + q.q); n++; });
    cfg.kit.forEach(function (q) { lines.push(n + ". " + q); n++; });
    lines.push("", J.fact + ":");
    facts(r).forEach(function (f) { lines.push("- " + f.title + (f.seal_label ? " [" + f.seal_label + "]" : "") + ": " + f.sentence); });
    return lines.join("\n");
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
  function block(cls, kicker, title) {
    var b = el("section", "rblock " + (cls || ""));
    if (kicker) b.appendChild(el("p", "t-label rblock-k", kicker));
    if (title) b.appendChild(el("h3", "t-title rblock-h", title));
    return b;
  }
  function metaRow(label, text, extraCls) { var w = el("div", "fmeta" + (extraCls ? " " + extraCls : "")); w.appendChild(el("span", "t-label", label)); w.appendChild(el("p", null, text)); return w; }
  function checkDetails(f) {
    if (!(f.check && f.check.length)) return null;
    var dt = el("details", "fdet"); dt.appendChild(el("summary", "m-state", J.check));
    var ol = el("ol"); f.check.forEach(function (s) { ol.appendChild(el("li", null, s)); }); dt.appendChild(ol); return dt;
  }
  function feedback(f) {
    if (!(f.id && window.__readId)) return null;
    var fb = el("div", "ffb"); fb.setAttribute("aria-live", "polite"); fb.appendChild(el("span", "t-note", J.fb_q));
    [["correct", J.fb_yes], ["incorrect", J.fb_no], ["unknown", J.fb_unk]].forEach(function (p) {
      var b2 = el("button", "m-chip", p[1]); b2.type = "button";
      b2.addEventListener("click", function () {
        fetch(API + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read_id: window.__readId, finding: f.id, verdict: p[0] }) }).catch(function () {});
        fb.textContent = ""; fb.appendChild(el("span", "t-note", J.fb_thanks));
      });
      fb.appendChild(b2);
    });
    return fb;
  }
  function evidence(f) { if (!(f.evidence && f.evidence.length)) return null; var ev = el("p", "m-source"); ev.textContent = J.evidence + ": " + f.evidence.slice(0, 4).map(iso).join(" · "); return ev; }

  // Un hecho: qué vi (sello + frase + evidencia) · para vos · qué hacer (y cómo la segunda lectura lo confirma) · comprobalo vos · ¿es correcto?
  function finding(f, i) {
    var c = el("article", "finding st-" + f.state + (f.lite ? " finding--lite" : "")); c.style.setProperty("--i", i);
    var top = el("div", "ftop"); top.appendChild(stateLabel(f.state)); if (f.seal) top.appendChild(el("span", sealClass(f.seal), f.seal_label)); c.appendChild(top);
    c.appendChild(el("h4", "t-title ftitle", f.title));
    c.appendChild(el("p", "fsent", f.sentence));
    var ev = evidence(f); if (ev) c.appendChild(ev);
    if (f.why) c.appendChild(metaRow(J.lab_why, f.why));
    if (f.action) { var ar = metaRow(J.lab_do, f.action, "fdo"); if (f.state !== "ok") ar.appendChild(el("p", "t-note", J.do_reread)); c.appendChild(ar); }
    var dt = checkDetails(f); if (dt) c.appendChild(dt);
    if (f.agency) { var ag = el("p", "fagency-line t-support"); ag.appendChild(el("b", null, J.agency + ": ")); ag.appendChild(d.createTextNode(f.agency)); c.appendChild(ag); }
    var fb = feedback(f); if (fb) c.appendChild(fb);
    return c;
  }
  // Un hecho "bien": una línea, sin ceremonia.
  function okRow(f) {
    var li = el("li", "okrow"); li.appendChild(stateLabel(f.state)); var t = el("span"); t.appendChild(el("b", null, f.title + (/[?!]$/.test(f.title) ? " " : ". "))); t.appendChild(d.createTextNode(f.sentence)); li.appendChild(t); return li;
  }
  // Una pista del código (bloque 3): sello inferido o no lo vi, texto, evidencia, comprobalo vos.
  function hintCard(h) {
    var c = el("article", "hint st-" + h.state);
    var top = el("div", "ftop"); top.appendChild(stateLabel(h.state)); top.appendChild(el("span", sealClass(h.seal), h.seal_label)); c.appendChild(top);
    c.appendChild(el("h4", "t-title ftitle", h.title));
    c.appendChild(el("p", "fsent", h.text));
    var ev = evidence(h); if (ev) c.appendChild(ev);
    var dt = checkDetails(h); if (dt) c.appendChild(dt);
    var fb = feedback(h); if (fb) c.appendChild(fb);
    return c;
  }

  var lastResult = null;
  function render(r) {
    lastResult = r;
    window.__readId = r.read_id || null;
    var root = $("#result-in"); root.textContent = "";
    var host = ""; try { host = new URL(r.final_url || r.url).hostname; } catch (e) {}
    var head = el("div", "rhead");
    head.appendChild(el("p", "t-label", J.reading_of + " " + host));
    head.appendChild(el("p", "t-mono rmeta", iso(r.date) + " · " + J.pov + ": " + r.point_of_view + " · " + r.loads + " " + J.loads_label + " · " + iso(r.elapsed + " s")));
    if (r.recorded) head.appendChild(el("p", "t-note", J.ex_recorded.replace("{date}", r.date)));
    else if (r.cached) head.appendChild(el("p", "t-note", J.cached));
    root.appendChild(head);

    if (r.unreadable) {
      var u = el("div", "unread m-card"); u.appendChild(el("h2", "t-headline", J.unreadable_h));
      [[J.unreadable_cause, r.unreadable.cause], [J.unreadable_tried, r.unreadable.tried], [J.unreadable_needs, r.unreadable.needs]].forEach(function (p) { u.appendChild(el("p", "t-label", p[0])); u.appendChild(el("p", "t-body", p[1])); });
      root.appendChild(u); actions(root, r); reveal(); return;
    }
    var hl = el("h2", "t-headline rhl", r.headline); hl.tabIndex = -1; root.appendChild(hl);

    // 1 · Lo que vi (hacelo vos): hechos por gravedad; los "bien" en una línea al final
    var all = facts(r), loud = all.filter(function (f) { return f.state !== "ok"; }), fine = all.filter(function (f) { return f.state === "ok"; });
    var b1 = block("b1", J.b1_k, J.b1_h);
    var g = el("div", "findings"); loud.forEach(function (f, i) { g.appendChild(finding(f, i)); }); b1.appendChild(g);
    if (fine.length) { var ul = el("ul", "okrows"); fine.forEach(function (f) { ul.appendChild(okRow(f)); }); b1.appendChild(ul); }
    root.appendChild(b1);

    // 2 · Preguntale a tu agencia: las preguntas que salen de los hechos, numeradas, con un solo botón
    var qs = questions(r);
    if (qs.length) {
      var b2 = block("b2", J.b2_k, J.b2_h);
      var ol = el("ol", "agq"); qs.forEach(function (q) { var li = el("li"); li.appendChild(el("span", null, q.q)); li.appendChild(el("small", "t-note", q.from)); ol.appendChild(li); }); b2.appendChild(ol);
      var row2 = el("div", "cta-row");
      var cb = el("button", "m-btn m-btn--outlined", J.b2_copy); cb.type = "button"; cb.addEventListener("click", function () { window.medidoCopy(agencyText(r), cb, J.copied); emit("questions_copied", { what: "all" }); }); row2.appendChild(cb);
      b2.appendChild(row2);
      b2.appendChild(el("p", "t-support", J.b2_more));
      b2.appendChild(el("p", "t-body b2note", J.b2_note));
      root.appendChild(b2);
    }

    // 3 · Lo que un navegador confirma: solo cuando esta lectura no abrió uno (pistas del código); con navegador, duplicados y clics ya son hechos del bloque 1
    var h = hintsOf(r);
    if (h) {
      var b3 = block("b3", J.b3_k, J.b3_h);
      if (r.checks && r.checks.browser_load === "failed") b3.appendChild(el("p", "t-support", J.b3_fallback));
      if (h.note) b3.appendChild(el("p", "t-support", h.note));
      var hg = el("div", "hints"); [h.dup, h.click].forEach(function (x) { if (x) hg.appendChild(hintCard(x)); }); b3.appendChild(hg);
      var paths = el("div", "paths"); paths.appendChild(el("p", "t-label", J.b3_paths_h));
      var pl = el("ol", "paths-list");
      [[J.b3_self, J.b3_self_d], [J.b3_me, J.b3_me_d]].forEach(function (p) { var li = el("li"); li.appendChild(el("b", null, p[0])); li.appendChild(el("span", null, p[1])); pl.appendChild(li); });
      paths.appendChild(pl); b3.appendChild(paths);
      root.appendChild(b3);
    }

    // 4 · Lo que no se ve desde afuera: con acceso de lectura (el Diagnóstico) o nunca
    var access = [], never = [];
    (r.cant_see || []).forEach(function (c, i) { var grp = c.group || (i < 4 ? "access" : "never"); (grp === "never" ? never : access).push(c); });
    var b4 = block("b4 m-card--accent", null, J.b4_h);
    if (access.length) {
      b4.appendChild(el("p", "t-body", J.b4_access));
      var ul4 = el("ul", "cantlist"); access.forEach(function (c) { var li = el("li"); li.appendChild(el("b", null, c.title)); li.appendChild(el("span", "t-support", c.text)); ul4.appendChild(li); }); b4.appendChild(ul4);
    }
    var diag = el("p", "t-body b4diag"); diag.appendChild(el("b", null, J.b4_diag)); b4.appendChild(diag);
    if (cfg.ask) {
      var A = cfg.ask, arow = el("div", "cta-row"), aa = el("a", "m-btn m-btn--filled", A.ask_btn);
      aa.href = mailto(A.ask_subject, A.ask_body.replace("{url}", r.url || lastUrl).replace("{langname}", A.lang_name).replace("{spend}", J.spend_labels[spend]));
      arow.appendChild(aa);
      if (cfg.diag_href) { var dl = el("a", "m-btn m-btn--text", J.b4_link); dl.href = cfg.diag_href; arow.appendChild(dl); }
      b4.appendChild(arow); b4.appendChild(el("p", "t-note", A.ask_note));
    }
    if (never.length) {
      var nv = el("p", "t-support b4never"); nv.appendChild(el("b", null, J.b4_never + " ")); nv.appendChild(d.createTextNode(never.map(function (c) { return c.title + " (" + c.text.replace(/\.$/, "") + ")"; }).join(" · ") + "."));
      b4.appendChild(nv);
    }
    root.appendChild(b4);

    // qué cambió (segunda lectura comparada)
    var chg = el("div", "changes m-card"); chg.appendChild(el("h3", "t-title", J.changes_h + (r.previous && r.previous.date ? " (" + iso(r.previous.date) + ")" : "")));
    if (!r.previous) chg.appendChild(el("p", "t-support", J.first));
    else if (!r.previous.changes.length) chg.appendChild(el("p", "t-support", J.changes_none));
    else {
      var cl = el("ul"); r.previous.changes.forEach(function (c) {
        var t = c.what + ": ", raw = function (v) { return typeof v === "string" ? v : JSON.stringify(v); };
        if (c.added || c.removed) t += (c.added && c.added.length ? "+ " + c.added.join(", ") + " " : "") + (c.removed && c.removed.length ? "− " + c.removed.join(", ") : "");
        else t += raw(c.from) + " → " + raw(c.to);
        cl.appendChild(el("li", "t-mono", t));
      }); chg.appendChild(cl);
    }
    root.appendChild(chg);

    // 5 · Después
    actions(root, r); reveal();
  }

  function actions(root, r) {
    var nx = block("b5 nextbox", null, J.b5_h);
    var cq = el("div", "clearq"); cq.appendChild(el("p", "t-body", J.clear_q)); var cr = el("div", "chips");
    [["yes", J.clear_yes], ["partly", J.clear_partly], ["no", J.clear_no]].forEach(function (p) {
      var cb = el("button", "m-chip", p[1]); cb.type = "button";
      cb.addEventListener("click", function () { emit("reading_feedback", { value: p[0] }); cq.textContent = ""; cq.appendChild(el("p", "t-note", J.clear_thanks)); });
      cr.appendChild(cb);
    });
    cq.appendChild(cr); nx.appendChild(cq);
    nx.appendChild(el("p", "t-body", J.next_text));
    var row = el("div", "cta-row");
    var a1 = el("a", "m-btn m-btn--filled", J.next_btn); a1.href = mailto(cfg.subject_reread, (cfg.body_reread || cfg.body).replace("{url}", r.url || lastUrl).replace("{spend}", J.spend_labels[spend])); a1.addEventListener("click", function () { emit("reread_requested"); }); row.appendChild(a1);
    if (r.unreadable) { var a2 = el("a", "m-btn m-btn--outlined", J.diag_btn); a2.href = mailto(cfg.subject, mailBody(r.url || lastUrl, "")); row.appendChild(a2); }   // en una lectura normal, el pedido va en el bloque 4
    // Compartir: el enlace permanente abre esta misma lectura (?site=). En el celular usa la hoja de compartir del sistema; si no, copia el enlace.
    var host = hostOf(r.url || lastUrl), link = location.origin + location.pathname + "?site=" + encodeURIComponent(r.url || lastUrl);
    var b4 = el("button", "m-btn m-btn--outlined", J.share); b4.type = "button";
    b4.addEventListener("click", function () {
      var text = J.share_text.replace("{host}", host);
      if (navigator.share) { navigator.share({ title: J.share_subject.replace("{host}", host), text: text, url: link }).then(function () { emit("reading_shared", { how: "native" }); }).catch(function () {}); }
      else { window.medidoCopy(text + " " + link, b4, J.copied); emit("reading_shared", { how: "copy" }); }
    }); row.appendChild(b4);
    var b2 = el("button", "m-btn m-btn--text", J.copy_reading); b2.type = "button"; b2.addEventListener("click", function () { window.medidoCopy(readingText(r), b2, J.copied); }); row.appendChild(b2);
    var b3 = el("button", "m-btn m-btn--text", J.read_again); b3.type = "button"; b3.addEventListener("click", function () { start(lastUrl); }); row.appendChild(b3);
    nx.appendChild(row);
    nx.appendChild(el("p", "t-note", J.next_note));
    // Reunión de 45 minutos. Con Cal.com configurado (cfg.booking por idioma), la nota comparativa que elige, paga y agenda;
    // si no, el botón al formulario de contacto con el pedido armado.
    var bk = cfg.booking || {};
    if (bk.talk && bk.note) {
      var sess = el("div", "sess"); sess.appendChild(el("p", "t-label", J.sess_h));
      [["talk", J.sess_talk_n, J.sess_talk_d, J.sess_talk_p], ["note", J.sess_note_n, J.sess_note_d, J.sess_note_p]].forEach(function (o) {
        var rw = el("div", "sess-row"), tx = el("div", "sess-tx"); tx.appendChild(el("b", null, o[1])); tx.appendChild(el("span", "t-support", o[2])); rw.appendChild(tx);
        rw.appendChild(el("b", "sess-p", o[3]));
        var a = el("a", "m-btn m-btn--outlined", J.sess_book); a.href = bk[o[0]] + "?site=" + encodeURIComponent(r.url || lastUrl); a.target = "_blank"; a.rel = "noopener";
        a.addEventListener("click", function () { emit("meeting_requested", { option: o[0], via: "cal" }); }); rw.appendChild(a); sess.appendChild(rw);
      });
      nx.appendChild(sess);
    } else {
      var a3 = el("a", "m-btn m-btn--outlined", J.meet_btn); a3.href = mailto(J.meet_subject.replace("{host}", host), J.meet_body.replace("{host}", host).replace("{url}", r.url || lastUrl));
      a3.addEventListener("click", function () { emit("meeting_requested", { host_known: true, via: "form" }); }); row.appendChild(a3);
    }
    // qué te conviene según el gasto: vive en los precios, debajo de la lista (no en medio de la lectura)
    var rl = el("p", "t-support"); var ra = el("a", null, J.route_link); ra.href = "#prices"; rl.appendChild(ra); nx.appendChild(rl);
    root.appendChild(nx);
  }

  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return u; } }
  function emit(name, extra) { try { d.dispatchEvent(new CustomEvent("medido:" + name, { detail: Object.assign({ page_lang: cfg.lang }, extra || {}) })); } catch (e) {} }
  // Al terminar: el informe aparece, el foco va al titular (un lector de pantalla anuncia el titular, no 4.000 px de informe),
  // y las tarjetas entran recién cuando la vista llegó: así la coreografía se ve entera.
  function reveal() {
    show("result", true);
    if (!(lastResult && lastResult.recorded)) emit("reading_completed", { state: (lastResult && lastResult.state) || "" });
    var s = d.getElementById("result"), hl = $("#result .rhl");
    var go = function () { d.body.classList.add("has-result"); if (hl) { try { hl.focus({ preventScroll: true }); } catch (e) { hl.focus(); } } };
    if (reduced) { s.scrollIntoView({ block: "start" }); go(); return; }
    setTimeout(function () { s.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(go, 420); }, 50);
  }
})();
