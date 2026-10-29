// Medido · la caja de lectura. Habla con /api/start y /api/status del servidor de Lupa.
// Todo texto que viene del servidor se inserta con textContent. Si no hay servidor, ofrece escribir.
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
  function note(txt, err) { var n = $("#formnote"); n.textContent = txt; n.classList.toggle("err", !!err); }

  function iso(t) { return cfg.lang === "he" ? "\u2066" + t + "\u2069" : t; }
  function sealClass(s) { return s === "verified" ? "m-tag m-tag--ver" : s === "inferred" ? "m-tag m-tag--inf" : s === "reported" ? "m-tag m-tag--rep" : "m-tag m-tag--not"; }
  var STATE = { problem: "✕", warn: "!", ok: "✓", info: "i" };
  function stateLabel(s) { var b = el("span", "stlabel st-" + s); b.appendChild(el("b", null, STATE[s] || "i")); b.appendChild(el("span", null, J[s] || s)); return b; }

  function show(id, on) { var n = d.getElementById(id); if (n) n.hidden = !on; }

  // Enlace compartido: ?site=... arranca la lectura al abrir la página (misma caché del Worker: no gasta una lectura nueva dentro de las 6 horas).
  try { var qs = new URLSearchParams(location.search).get("site"); if (qs) { $("#site").value = qs; setTimeout(function () { lastUrl = qs; emit("pql_reading_requested", { via: "shared_link" }); start(qs); }, 50); } } catch (e) {}
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
    show("idle", false); show("progress", true); show("result", false);
    beginLog();
    getToken().then(function (token) {
      return fetch(API + "/api/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url, lang: cfg.lang, token: token }) });
    })
      .then(function (r) { return r.json().catch(function () { return { error: "?" }; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (o) {
        if (o.status === 404 || o.status === 405 || o.status === 501) return offline(url);
        if (o.j.error) return fail(o.j.error);
        poll(o.j.id, 0);
      })
      .catch(function () { offline(url); });
  }

  function fail(msg) { busy = false; $("#go").disabled = false; show("progress", false); show("log", false); show("idle", true); note(msg, true); }
  function offline(url) {
    busy = false; $("#go").disabled = false; show("progress", false); show("log", false); show("idle", true);
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
        setTimeout(function () { show("progress", false); show("log", false); show("idle", true); render(s.result); }, 500); return;
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
    var ln = el("div", "ln" + (cls ? " " + cls : "")); ln.appendChild(el("span", "t", (t == null ? (Date.now() - t0) / 1000 : t).toFixed(1) + "s")); ln.appendChild(el("span", null, txt));
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
    show("idle", false); show("progress", true); show("result", false); beginLog();
    var D = cfg.demo, last = D.timeline[D.timeline.length - 1].t;
    D.timeline.forEach(function (s, i) { logTimers.push(setTimeout(function () { addStep(s.step, i + 1, s.t); }, s.t * 1000)); });
    logTimers.push(setTimeout(function () {
      finishLog(D.result); busy = false; $("#go").disabled = false;
      setTimeout(function () { show("progress", false); show("log", false); show("idle", true); render(D.result); }, 500);
    }, (last + 0.4) * 1000));
    emit("example_played");
  });

  // ---------- resultado ----------
  function agencyText(r) {
    var host = ""; try { host = new URL(r.url).hostname; } catch (e) {}
    var lines = [J.kit_intro.replace("{host}", host).replace("{date}", r.date), ""];
    var n = 1;
    r.main.forEach(function (f) { if (f.agency) { lines.push(n + ". " + f.agency); n++; } });
    cfg.kit.forEach(function (q) { lines.push(n + ". " + q); n++; });
    lines.push("", J.fact + ":");
    r.main.forEach(function (f) { lines.push("- " + f.title + " [" + f.seal_label + "]: " + f.sentence); });
    return lines.join("\n");
  }
  function readingText(r) {
    var lines = [J.reading_of + " " + r.url, r.date + " · " + r.pov, "", r.headline, ""];
    r.main.forEach(function (f) { lines.push("[" + f.seal_label + "] " + f.title); lines.push(f.sentence); if (f.why) lines.push("(" + J.why + ") " + f.why); lines.push(""); });
    lines.push(J.cant_h + ":"); r.cant_see.forEach(function (c) { lines.push("- " + c.title + ": " + c.text); });
    return lines.join("\n");
  }

  function finding(f) {
    var c = el("article", "finding st-" + f.state);
    var top = el("div", "ftop"); top.appendChild(el("h3", "t-title", f.title)); top.appendChild(el("span", sealClass(f.seal), f.seal_label)); c.appendChild(top);
    c.appendChild(stateLabel(f.state));
    c.appendChild(el("p", "fsent", f.sentence));
    if (f.why) { var w = el("p", "fwhy"); w.appendChild(el("b", null, J.why + ": ")); w.appendChild(d.createTextNode(f.why)); c.appendChild(w); }
    if (f.evidence && f.evidence.length) { var ev = el("p", "m-source"); ev.textContent = J.evidence + ": " + f.evidence.slice(0, 4).map(iso).join(" · "); c.appendChild(ev); }
    if (f.check && f.check.length) {
      var dt = el("details", "fdet"); dt.appendChild(el("summary", null, J.check));
      var ol = el("ol"); f.check.forEach(function (s) { ol.appendChild(el("li", null, s)); }); dt.appendChild(ol); c.appendChild(dt);
    }
    if (f.id && window.__readId) {
      var fb = el("div", "ffb"); fb.appendChild(el("span", "t-note", J.fb_q));
      [["correct", J.fb_yes], ["incorrect", J.fb_no], ["unknown", J.fb_unk]].forEach(function (p) {
        var b2 = el("button", "m-chip", p[1]); b2.type = "button";
        b2.addEventListener("click", function () {
          fetch(API + "/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ read_id: window.__readId, finding: f.id, verdict: p[0] }) }).catch(function () {});
          fb.textContent = ""; fb.appendChild(el("span", "t-note", J.fb_thanks));
        });
        fb.appendChild(b2);
      });
      c.appendChild(fb);
    }
    if (f.agency) {
      var ag = el("div", "fagency"); ag.appendChild(el("span", "t-label", J.agency)); ag.appendChild(el("p", null, f.agency));
      var b = el("button", "m-btn m-btn--text", J.copy_reading === "" ? "" : (cfg.lang === "he" ? "העתקה" : cfg.lang === "es" ? "Copiar" : "Copy")); b.type = "button";
      b.addEventListener("click", function () { window.medidoCopy(f.agency, b, J.copied); emit("questions_copied", { what: "one" }); }); ag.appendChild(b); c.appendChild(ag);
    }
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
    root.appendChild(el("h2", "t-headline rhl", r.headline));
    var g = el("div", "findings"); r.main.forEach(function (f) { g.appendChild(finding(f)); }); root.appendChild(g);

    var cant = el("div", "cant m-card m-card--outlined"); cant.appendChild(el("h3", "t-title", J.cant_h)); cant.appendChild(el("p", "t-support", J.cant_note));
    var ul = el("ul"); r.cant_see.forEach(function (c) { var li = el("li"); li.appendChild(el("b", null, c.title)); li.appendChild(el("span", null, c.text)); ul.appendChild(li); }); cant.appendChild(ul); root.appendChild(cant);

    // lo que no veo desde afuera: el Diagnóstico con acceso a Analytics (pedido por mail; todavía no se paga en la web)
    if (cfg.ask) {
      var A = cfg.ask, ak = el("div", "gask m-card m-card--accent");
      ak.appendChild(el("h3", "t-title", A.ask_h)); ak.appendChild(el("p", "t-body", A.ask_p));
      if (A.price) ak.appendChild(el("p", "t-support", A.price));
      var arow = el("div", "cta-row"), aa = el("a", "m-btn m-btn--filled", A.ask_btn);
      aa.href = mailto(A.ask_subject, A.ask_body.replace("{url}", r.url || lastUrl).replace("{langname}", A.lang_name).replace("{spend}", J.spend_labels[spend]));
      arow.appendChild(aa); ak.appendChild(arow); ak.appendChild(el("p", "t-note", A.ask_note)); root.appendChild(ak);
    }

    // qué cambió
    var chg = el("div", "changes m-card"); chg.appendChild(el("h3", "t-title", J.changes_h));
    if (!r.previous) chg.appendChild(el("p", "t-support", J.first));
    else if (!r.previous.changes.length) chg.appendChild(el("p", "t-support", J.changes_none));
    else {
      var cl = el("ul"); r.previous.changes.forEach(function (c) {
        var t = c.what + ": ";
        if (c.added || c.removed) t += (c.added && c.added.length ? "+ " + c.added.join(", ") + " " : "") + (c.removed && c.removed.length ? "− " + c.removed.join(", ") : "");
        else t += JSON.stringify(c.from) + " → " + JSON.stringify(c.to);
        cl.appendChild(el("li", "t-mono", t));
      }); chg.appendChild(cl);
    }
    root.appendChild(chg);

    // puente: qué agrega cada paso
    var nv = r.main.filter(function (f) { return f.seal !== "verified"; }).length;
    var br = el("div", "bridge"); br.appendChild(el("h3", "t-title", J.bridge_h));
    var bl = el("ol", "bridge-list");
    J.bridge.forEach(function (b) { var li = el("li"); li.appendChild(el("b", null, b[0])); li.appendChild(el("span", null, b[1].replace("{n}", nv).replace("{m}", r.cant_see.length))); bl.appendChild(li); });
    br.appendChild(bl); root.appendChild(br);

    // ruteo por gasto
    var rt = el("div", "route m-card m-card--accent"); rt.appendChild(el("h3", "t-title", J.route_h)); rt.appendChild(el("p", "t-body", J["route_" + spend])); root.appendChild(rt);

    // más
    var more = el("details", "more"); more.appendChild(el("summary", "t-title", J.more_h + " (" + r.more.length + ")"));
    r.more.forEach(function (f) { var row = el("div", "mrow st-" + f.state); var h = el("div", "mh"); h.appendChild(stateLabel(f.state)); h.appendChild(el("b", null, f.title)); row.appendChild(h); row.appendChild(el("p", "t-support", f.text)); more.appendChild(row); });
    root.appendChild(more);

    actions(root, r); reveal();
  }

  function actions(root, r) {
    var nx = el("div", "nextbox"); nx.appendChild(el("h3", "t-title", J.next_h)); nx.appendChild(el("p", "t-body", J.next_text));
    var row = el("div", "cta-row");
    var a1 = el("a", "m-btn m-btn--filled", J.next_btn); a1.href = mailto(cfg.subject_reread, (cfg.body_reread || cfg.body).replace("{url}", r.url || lastUrl).replace("{spend}", J.spend_labels[spend])); a1.addEventListener("click", function () { emit("reread_requested"); }); row.appendChild(a1);
    if (r.unreadable) { var a2 = el("a", "m-btn m-btn--outlined", J.diag_btn); a2.href = mailto(cfg.subject, mailBody(r.url || lastUrl, "")); row.appendChild(a2); }   // en una lectura normal, el pedido va en la tarjeta de lo que no veo
    var b1 = el("button", "m-btn m-btn--outlined", J.copy_agency); b1.type = "button"; b1.addEventListener("click", function () { window.medidoCopy(agencyText(r), b1, J.copied); emit("questions_copied", { what: "all" }); }); row.appendChild(b1);
    var b2 = el("button", "m-btn m-btn--outlined", J.copy_reading); b2.type = "button"; b2.addEventListener("click", function () { window.medidoCopy(readingText(r), b2, J.copied); }); row.appendChild(b2);
    // Compartir: el enlace permanente abre esta misma lectura (?site=). En el celular usa la hoja de compartir del sistema; si no, copia el enlace.
    var host = hostOf(r.url || lastUrl), link = location.origin + location.pathname + "?site=" + encodeURIComponent(r.url || lastUrl);
    var b4 = el("button", "m-btn m-btn--outlined", J.share); b4.type = "button";
    b4.addEventListener("click", function () {
      var text = J.share_text.replace("{host}", host);
      if (navigator.share) { navigator.share({ title: J.share_subject.replace("{host}", host), text: text, url: link }).then(function () { emit("reading_shared", { how: "native" }); }).catch(function () {}); }
      else { window.medidoCopy(text + " " + link, b4, J.copied); emit("reading_shared", { how: "copy" }); }
    }); row.appendChild(b4);
    // Reunión de 45 minutos: va al formulario de contacto con el pedido armado.
    // Reunión de 45 minutos. Con Cal.com configurado (cfg.booking por idioma), dos botones que eligen, pagan y agendan;
    // si no, el botón de siempre al formulario de contacto con el pedido armado.
    var bk = cfg.booking || {};
    if (bk.talk && bk.note) {
      [["talk", J.meet_btn_talk, "m-btn m-btn--filled"], ["note", J.meet_btn_note, "m-btn m-btn--outlined"]].forEach(function (o) {
        var a = el("a", o[2], o[1]); a.href = bk[o[0]] + "?site=" + encodeURIComponent(r.url || lastUrl); a.target = "_blank"; a.rel = "noopener";
        a.addEventListener("click", function () { emit("meeting_requested", { option: o[0], via: "cal" }); }); row.appendChild(a);
      });
    } else {
      var a3 = el("a", "m-btn m-btn--filled", J.meet_btn); a3.href = mailto(J.meet_subject.replace("{host}", host), J.meet_body.replace("{host}", host).replace("{url}", r.url || lastUrl));
      a3.addEventListener("click", function () { emit("meeting_requested", { host_known: true, via: "form" }); }); row.appendChild(a3);
    }
    var b3 = el("button", "m-btn m-btn--text", J.read_again); b3.type = "button"; b3.addEventListener("click", function () { start(lastUrl); }); row.appendChild(b3);
    var cq = el("div", "clearq"); cq.appendChild(el("p", "t-body", J.clear_q)); var cr = el("div", "chips");
    [["yes", J.clear_yes], ["partly", J.clear_partly], ["no", J.clear_no]].forEach(function (p) {
      var cb = el("button", "m-chip", p[1]); cb.type = "button";
      cb.addEventListener("click", function () { emit("reading_feedback", { value: p[0] }); cq.textContent = ""; cq.appendChild(el("p", "t-note", J.clear_thanks)); });
      cr.appendChild(cb);
    });
    cq.appendChild(cr); nx.appendChild(cq);
    nx.appendChild(row); nx.appendChild(el("p", "t-note", J.next_note)); root.appendChild(nx);
  }

  function hostOf(u) { try { return new URL(u).hostname; } catch (e) { return u; } }
  function emit(name, extra) { try { d.dispatchEvent(new CustomEvent("medido:" + name, { detail: Object.assign({ page_lang: cfg.lang }, extra || {}) })); } catch (e) {} }
  function reveal() { d.body.classList.add("has-result"); show("result", true); if (!(lastResult && lastResult.recorded)) emit("reading_completed", { state: (lastResult && lastResult.state) || "" }); var s = d.getElementById("result"); setTimeout(function () { s.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); }
})();
