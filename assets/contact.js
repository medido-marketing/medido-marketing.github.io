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

  // datos que llegan desde la portada (la caja de lectura): asunto, texto y sitio
  var q = function (k, n) { return (qs.get(k) || "").slice(0, n); };
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
        d.dispatchEvent(new CustomEvent("medido:lead", { detail: { page_lang: cfg.lang } }));
      })
      .catch(function () {
        send.disabled = false; send.textContent = label;
        show(errAll, C.err.replace("{email}", cfg.email));
      });
  });
})();
