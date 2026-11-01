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

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    show(errAll, ""); show(errAck, ""); fieldErr(email, "");
    var bad = null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email.value || "").trim())) { fieldErr(email, C.need_email); show(errAll, C.need_email); bad = email; }
    else if (!ack.checked) { show(errAck, C.need_ack); bad = ack; }
    if (bad) { bad.focus(); return; }
    spendIn.value = spendKey ? (cfg.spend_labels[spendKey] || spendKey) : "";
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
        d.dispatchEvent(new CustomEvent("medido:lead", { detail: det }));
      })
      .catch(function () {
        send.disabled = false; send.textContent = label;
        show(errAll, C.err.replace("{email}", cfg.email));
      });
  });
})();
