// Medido · /book/: la reserva de 45 minutos dentro del sitio con el embed de Cal.com (cargado desde app.cal.com).
// Al confirmarse la reserva (bookingSuccessfulV2) avisa a la medición: meeting_booked en GA4 y Schedule en el píxel, ambos solo con consentimiento (measure.js).
// Ningún dato de la persona: solo el idioma, la opción y las UTM de la campaña.
(function () {
  var host = document.getElementById("cal-embed"); if (!host) return;
  var link = host.getAttribute("data-cal-link"); if (!link) return;
  var qs = new URLSearchParams(location.search), utm = {};
  ["utm_source", "utm_campaign", "utm_content"].forEach(function (k) { var v = (qs.get(k) || "").slice(0, 100).replace(/[^\w .:+~%-]/g, ""); if (v) utm[k] = v; });
  (function (C, A, L) { var p = function (a, ar) { a.q.push(ar); }; var d = C.document; C.Cal = C.Cal || function () { var cal = C.Cal; var ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { var api = function () { p(api, arguments); }; var namespace = ar[1]; api.q = api.q || []; if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
  window.Cal("init", { origin: "https://app.cal.com" });
  window.Cal("inline", { elementOrSelector: "#cal-embed", calLink: link, layout: "month_view" });
  window.Cal("ui", { theme: "light", layout: "month_view", styles: { branding: { brandColor: "#0E0F12" } } });
  window.Cal("on", { action: "bookingSuccessfulV2", callback: function () {
    document.dispatchEvent(new CustomEvent("medido:meeting_booked", { detail: Object.assign({ page_lang: "en", option: "talk" }, utm) }));
  } });
})();
