// Medido · medición del propio sitio. Google Analytics 4 y el píxel de Meta se cargan SOLO si hay un ID configurado Y la persona lo aceptó.
// GA4: el ID va abajo. Píxel de Meta: lo agrega el generador del sitio (tools/site_config.json -> meta_pixel_id) como <meta name="medido-meta-pixel">.
// Sin ningún ID no hay aviso, no se carga nada y no se guarda nada.
(function () {
  var GA4_ID = "G-T14ZL11D2C"; // ej. "G-ABC123DEF4"
  var pm = document.querySelector('meta[name="medido-meta-pixel"]'), PIXEL = pm ? (pm.getAttribute("content") || "") : "";
  if (!GA4_ID && !PIXEL) return;
  var T = {
    en: { t: "I would like to measure visits and contact requests with Google Analytics. It loads only if you accept.", yes: "Accept", no: "Decline", label: "Measurement", both: "I would like to measure visits and contact requests with Google Analytics and the Meta pixel (to measure my own ads). They load only if you accept." },
    he: { t: "אני רוצה למדוד ביקורים ופניות באמצעות Google Analytics. הוא נטען רק אם תאשרו.", yes: "אישור", no: "דחייה", label: "מדידה", both: "אני רוצה למדוד ביקורים ופניות באמצעות Google Analytics ופיקסל של Meta (כדי למדוד את המודעות שלי). הם נטענים רק אם תאשרו." },
    es: { t: "Quiero medir visitas y pedidos de contacto con Google Analytics. Se carga solo si aceptás.", yes: "Aceptar", no: "Rechazar", label: "Medición", both: "Quiero medir visitas y pedidos de contacto con Google Analytics y el píxel de Meta (para medir mis propios anuncios). Se cargan solo si aceptás." }
  };
  var lang = (document.documentElement.lang || "en").slice(0, 2), L = T[lang] || T.en, KEY = "medido_ga";
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGa() {
    if (!GA4_ID) return;
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", GA4_ID, { anonymize_ip: true });
    // Evento clave: envío del formulario de contacto (lo dispara contact.js).
    document.addEventListener("medido:lead", function (e) { gtag("event", "generate_lead", { page_lang: (e.detail && e.detail.page_lang) || lang }); });
    // Clic en un mail de contacto (solo existe si el sitio está en modo mailto).
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (a) gtag("event", "click_mail", { link_text: a.textContent.trim(), page_lang: lang });
    });
  }

  // Píxel de Meta: carga estándar de Meta, solo con consentimiento. Evento clave "Lead" = envío del formulario (el mismo que generate_lead en GA4).
  function loadMeta() {
    if (!PIXEL || window.fbq) return;
    var n = window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    var s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(s);
    window.fbq("init", PIXEL); window.fbq("track", "PageView");
    document.addEventListener("medido:lead", function () { window.fbq("track", "Lead"); });
  }
  function load() { loadGa(); loadMeta(); }

  function banner() {
    var b = document.createElement("div");
    b.className = "cc"; b.setAttribute("role", "region"); b.setAttribute("aria-label", L.label);
    var p = document.createElement("p"); p.className = "t-body"; p.textContent = PIXEL ? L.both : L.t; b.appendChild(p);
    var row = document.createElement("div"); row.className = "cta-row";
    function btn(txt, cls, v) {
      var x = document.createElement("button"); x.type = "button"; x.className = "m-btn " + cls; x.textContent = txt;
      x.addEventListener("click", function () { set(v); b.remove(); if (v === "yes") load(); });
      return x;
    }
    row.appendChild(btn(L.yes, "m-btn--filled", "yes")); row.appendChild(btn(L.no, "m-btn--outlined", "no"));
    b.appendChild(row); document.body.appendChild(b);
  }

  var c = get();
  if (c === "yes") load(); else if (c !== "no") banner();
})();
