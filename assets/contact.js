// Medido · formulario de contacto. Envía a Formspree por fetch (JSON); muestra la confirmación o el error; avisa a la medición (evento generate_lead).
// Todo valor que viene de la dirección se asigna con .value / textContent, nunca como HTML.
(function () {
  var d = document, cfgEl = d.getElementById("cfg"); if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent), C = cfg.c;
  var form = d.getElementById("cform"); if (!form) return;
  var $ = function (id) { return d.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var email = $("c-email"), site = $("c-site"), msg = $("c-msg"), ack = $("c-ack"), spendIn = $("c-spend"), send = $("c-send");
  var errAll = $("c-err"), errAck = $("c-ackerr"), ok = $("c-ok"), subj = $("c-subject");

  // el formulario según desde dónde se llega (1/11): ?m=help, ?m=hello o ?m=diag; sin m, el contacto general.
  // Un asunto viejo de Diagnóstico (?subject=…) también abre el modo Diagnóstico.
  var q = function (k, n) { return (qs.get(k) || "").slice(0, n); };
  var M = cfg.modes || {}, mk = q("m", 10);
  if (!M[mk]) mk = (M.diag && q("subject", 120) === M.diag.subject) ? "diag" : "hello";
  var m = M[mk], formMode = M[q("m", 10)] ? q("m", 10) : "general";
  if (m) {
    var set = function (id, t) { var n = $(id); if (n) n.textContent = t; };
    set("ch1", m.h1); set("c-lead", m.lead); set("c-site-l", m.site); set("c-msg-l", m.msg); set("c-send", m.send); set("c-okp", m.ok);
    subj.value = m.subject; var sb = $("c-spendbox"); if (sb) sb.hidden = !m.spend;
    if (cfg.title) d.title = cfg.title + " · " + m.h1;
    // al cambiar de idioma, el formulario sigue siendo el mismo motivo
    Array.prototype.forEach.call(d.querySelectorAll(".m-seg [data-go]"), function (x) { x.setAttribute("data-go", x.getAttribute("data-go").split("?")[0] + "?m=" + mk); });
  }
  // campos que solo tiene el modo «steps» (próximos pasos): nombre, apellido, rol, nota de qué se guarda, calendario al confirmar
  var steps = mk === "steps";
  Array.prototype.forEach.call(d.querySelectorAll("[data-only=steps]"), function (n) { if (n.id !== "c-cal") n.hidden = !steps; });
  // Verificación del correo con código (5/11): solo en el modo steps y con cfg.verify (el Worker de Lupa con el envío activo).
  var verify = steps && !!cfg.verify, verified = false, vbox = $("c-verify");
  if (verify && vbox) vbox.hidden = false;
  if (steps) { site.required = true; ["c-first", "c-last", "c-role"].forEach(function (id) { $(id).required = true; }); }
  // datos que llegan de otra página (la lectura, por ejemplo): asunto, texto y sitio
  if (q("subject", 120)) subj.value = q("subject", 120);
  if (q("body", 1500)) msg.value = q("body", 1500);
  if (q("site", 300)) site.value = q("site", 300);

  var spendKey = "";
  Array.prototype.forEach.call(form.querySelectorAll("[data-spend]"), function (c) {
    c.addEventListener("click", function () {
      var on = c.getAttribute("aria-pressed") !== "true";
      Array.prototype.forEach.call(form.querySelectorAll("[data-spend]"), function (x) { x.setAttribute("aria-pressed", "false"); });
      c.setAttribute("aria-pressed", on ? "true" : "false"); spendKey = on ? c.getAttribute("data-spend") : "";
    });
  });

  function show(el, txt) { el.textContent = txt; el.hidden = !txt; }
  function fieldErr(input, txt) {
    var f = input.closest(".m-field"); if (f) f.classList.toggle("m-field--error", !!txt);
    if (txt) { input.setAttribute("aria-invalid", "true"); } else { input.removeAttribute("aria-invalid"); }
  }
  email.addEventListener("input", function () { fieldErr(email, ""); show(errAll, ""); });
  ack.addEventListener("change", function () { show(errAck, ""); });

  // «Agregar al calendario» (solo modo steps): un recordatorio para cuando llegan los pasos, a las 48 horas hábiles. Google Calendar y .ics.
  // Todo en el navegador: el evento lleva título, la descripción y, si viene de una lectura, su enlace; ningún dato de la persona.
  function showCalendar() {
    var box = $("c-cal"); if (!box) return;
    // 48 horas hábiles: 2 días hábiles (sin sábado ni domingo), a la misma hora
    var start = new Date(), left = 2; while (left > 0) { start.setDate(start.getDate() + 1); var wd = start.getDay(); if (wd !== 0 && wd !== 6) left--; }
    var end = new Date(start.getTime() + 15 * 60 * 1000);
    var z = function (t) { return t.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); };
    var rid = q("r", 40), home = "https://marketingmedido.com" + (cfg.lang === "en" ? "/" : "/" + cfg.lang + "/");
    var desc = C.ev_desc + (/^[A-Za-z0-9_-]{8,40}$/.test(rid) ? " " + C.ev_read.replace("{u}", home + "?r=" + rid) : " " + home);
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(C.ev_title) + "&dates=" + z(start) + "/" + z(end) + "&details=" + encodeURIComponent(desc);
    var esc = function (t) { return t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); };
    var fold = function (l) { var o = []; while (l.length > 35) { o.push(l.slice(0, 35)); l = " " + l.slice(35); } o.push(l); return o.join("\r\n"); };
    var uid = "steps-" + start.getTime() + "-" + Math.random().toString(16).slice(2, 10) + "@marketingmedido.com";
    var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Medido//steps//" + cfg.lang.toUpperCase(), "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + z(new Date()), "DTSTART:" + z(start), "DTEND:" + z(end),
      "SUMMARY:" + esc(C.ev_title), "DESCRIPTION:" + esc(desc), "URL:" + home, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(C.ev_alarm), "TRIGGER:PT0S", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
    var ga = $("c-cal-g"), ia = $("c-cal-i");
    ga.href = g; ia.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" })); ia.download = "medido-next-steps.ics";
    ga.addEventListener("click", function () { d.dispatchEvent(new CustomEvent("medido:steps_calendar", { detail: { kind: "google" } })); });
    ia.addEventListener("click", function () { d.dispatchEvent(new CustomEvent("medido:steps_calendar", { detail: { kind: "ics" } })); });
    box.hidden = false;
  }

  // Verificación del correo: /api/email/code (manda el código, con Turnstile) y /api/email/verify (devuelve una prueba firmada de 30 min que viaja con el formulario).
  // Eventos solo con el hecho (email_code_sent / verified / failed), nunca el correo ni el código.
  if (verify) {
    var cs = $("c-code-send"), cb = $("c-code-box"), cc = $("c-code"), ck = $("c-code-check"), vm = $("c-vmsg"), pf = $("c-proof");
    var vev = function (n, x) { d.dispatchEvent(new CustomEvent("medido:" + n, { detail: Object.assign({ form_mode: formMode }, x || {}) })); };
    var vsay = function (t, err) { vm.textContent = t; vm.hidden = !t; vm.classList.toggle("err", !!err); };
    var post = function (path, body) { return fetch(cfg.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); }); };
    var ts = null, tsRes = null;
    var token = function () {
      if (!cfg.sitekey) return Promise.resolve("");
      return new Promise(function (ok, no) {
        var go = function () {
          var host = $("c-ts"); if (!host) { host = d.createElement("div"); host.id = "c-ts"; form.appendChild(host); }
          tsRes = ok;
          if (ts === null) ts = window.turnstile.render(host, { sitekey: cfg.sitekey, appearance: "interaction-only", execution: "execute", callback: function (t) { var f = tsRes; tsRes = null; try { window.turnstile.reset(ts); } catch (x) {} if (f) f(t); }, "error-callback": function () { no(new Error("turnstile")); } });
          window.turnstile.execute(ts);
        };
        if (window.turnstile) return go();
        var sc = d.createElement("script"); sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; sc.async = true; sc.onload = go; sc.onerror = function () { no(new Error("turnstile")); }; d.head.appendChild(sc);
      });
    };
    var emailOk = function () { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || "").trim()); };
    email.addEventListener("input", function () { if (verified) { verified = false; pf.value = ""; vsay(""); cs.hidden = false; cb.hidden = true; } });
    cs.addEventListener("click", function () {
      if (!emailOk()) { fieldErr(email, C.need_email); show(errAll, C.need_email); email.focus(); return; }
      show(errAll, ""); cs.disabled = true; var lbl = cs.textContent; cs.textContent = C.v_busy; vsay("");
      token().then(function (t) { return post("/api/email/code", { email: (email.value || "").trim(), lang: cfg.lang, token: t }); })
        .then(function (r) {
          cs.disabled = false; cs.textContent = C.v_resend;
          if (r.ok && r.j.ok) { cb.hidden = false; vsay(C.v_sent.replace("{email}", (email.value || "").trim())); vev("email_code_sent"); try { cc.focus(); } catch (x) {} }
          else { cs.textContent = lbl; vsay(r.j.error || C.v_fail, true); }
        }).catch(function () { cs.disabled = false; cs.textContent = lbl; vsay(C.v_fail, true); });
    });
    ck.addEventListener("click", function () {
      var code = (cc.value || "").replace(/\D/g, "");
      if (code.length !== 6) { cc.focus(); return; }
      ck.disabled = true;
      post("/api/email/verify", { email: (email.value || "").trim(), code: code, lang: cfg.lang }).then(function (r) {
        ck.disabled = false;
        if (r.ok && r.j.ok && r.j.proof) { verified = true; pf.value = r.j.proof; cb.hidden = true; cs.hidden = true; vsay(C.v_ok); vev("email_code_verified"); }
        else { vsay(r.j.error || C.v_fail, true); vev("email_code_failed", { reason: r.j.reason === "expired" ? "expired" : "wrong" }); }
      }).catch(function () { ck.disabled = false; vsay(C.v_fail, true); });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    show(errAll, ""); show(errAck, ""); fieldErr(email, "");
    var bad = null;
    if (verify && !verified) { show(errAll, C.v_need); (cs || email).focus(); return; }
    if (steps) {
      var miss = [$("c-first"), $("c-last"), site, $("c-role")].filter(function (x) { return !(x.value || "").trim(); })[0];
      if (miss) { show(errAll, C.need_fields); miss.focus(); return; }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || "").trim())) { fieldErr(email, C.need_email); show(errAll, C.need_email); bad = email; }
    else if (!ack.checked) { show(errAck, C.need_ack); bad = ack; }
    if (bad) { bad.focus(); return; }
    spendIn.value = spendKey ? (cfg.spend_labels[spendKey] || spendKey) : "";
    // «¿Cómo conociste Medido?»: al mail va el texto elegido; a la medición, solo la clave fija
    var how = $("c-how"), howKey = how ? how.value : "", howTxt = $("c-howtxt");
    if (howTxt) howTxt.value = howKey ? how.options[how.selectedIndex].textContent : "";
    send.disabled = true; var label = send.textContent; send.textContent = C.sending;
    fetch(cfg.form, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        form.hidden = true; ok.hidden = false; ok.focus();
        // para la medición (1/11): solo el motivo y el tramo, nunca el correo ni el mensaje
        var det = { page_lang: cfg.lang, form_mode: formMode }, tier = "";
        try { tier = sessionStorage.getItem("medido_tier") || ""; } catch (x) {}
        if (tier) det.spend_tier = tier;              // t1…t5, de la calculadora de la portada
        if (spendKey) det.spend_chip = spendKey;      // low / mid / high, de los botones de este formulario
        if (howKey) det.how_found = howKey;
        if (steps) { det.role = $("c-role").value; showCalendar(); }            // search, ai, ads, newsletter, team, referral, other
        d.dispatchEvent(new CustomEvent("medido:lead", { detail: det }));
      })
      .catch(function () {
        send.disabled = false; send.textContent = label;
        show(errAll, C.err.replace("{email}", cfg.email));
      });
  });
})();
