// Medido · medición del propio sitio. Google Analytics 4 y el píxel de Meta se cargan SOLO si hay un ID configurado Y la persona acepta.
// GA4: el ID va abajo. Píxel de Meta: lo agrega el generador del sitio (tools/site_config.json -> meta_pixel_id) como <meta name="medido-meta-pixel">.
// Sin ningún ID no hay aviso, no se carga nada y no se guarda nada.
(function () {
  var GA4_ID = "G-T14ZL11D2C"; // ej. "G-ABC123DEF4"
  var pm = document.querySelector('meta[name="medido-meta-pixel"]'), PIXEL = pm ? (pm.getAttribute("content") || "") : "";
  if (!GA4_ID && !PIXEL) return;
  // Interruptor para las visitas propias: abrir el sitio con ?interno=1 guarda una marca en ese navegador y desde entonces no se carga ni se manda nada
  // (ni Google Analytics ni Meta). ?interno=0 la quita. No depende de la dirección IP y no guarda ningún dato personal.
  try {
    var q = location.search;
    if (/[?&]interno=1(&|$)/.test(q)) localStorage.setItem("medido_interno", "1");
    else if (/[?&]interno=0(&|$)/.test(q)) localStorage.removeItem("medido_interno");
    if (localStorage.getItem("medido_interno") === "1") return;
  } catch (e) {}
  var T = {
    en: { t: "We use cookies to measure visits and contact requests.", yes: "Accept", no: "Decline", privacy: "Privacy", privacyHref: "/privacy/", label: "Cookies" },
    he: { t: "אנחנו משתמשים בעוגיות כדי למדוד ביקורים ופניות.", yes: "אישור", no: "דחייה", privacy: "פרטיות", privacyHref: "/he/privacy/", label: "עוגיות" },
    es: { t: "Usamos cookies para medir visitas y pedidos de contacto.", yes: "Aceptar", no: "Rechazar", privacy: "Privacidad", privacyHref: "/es/privacy/", label: "Cookies" }
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
    // Eventos propios del embudo: lectura completada (quien puso su sitio), preguntas copiadas, Analytics conectado.
    ["pql_reading_requested", "reading_completed", "questions_copied", "analytics_connected", "reading_shared", "meeting_requested", "reread_requested", "reading_feedback", "example_played"].forEach(function (name) {
      document.addEventListener("medido:" + name, function (e) { gtag("event", name, Object.assign({ page_lang: lang }, (e && e.detail) || {})); });
    });
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
    ["pql_reading_requested", "reading_completed", "questions_copied", "analytics_connected", "reading_shared", "meeting_requested", "reread_requested", "reading_feedback", "example_played"].forEach(function (name) {
      document.addEventListener("medido:" + name, function (e) { window.fbq("trackCustom", name, (e && e.detail) || {}); });
    });
  }
  function load() { loadGa(); loadMeta(); }

  function banner() {
    var b = document.createElement("div");
    b.className = "cc"; b.setAttribute("role", "region"); b.setAttribute("aria-label", L.label);
    var p = document.createElement("p"); p.className = "t-body"; p.textContent = L.t;
    // espacio sin corte antes del enlace: "Privacy" nunca queda solo en una línea
    var a = document.createElement("a"); a.href = L.privacyHref; a.textContent = "\u00a0" + L.privacy; p.appendChild(a);
    b.appendChild(p);
    var row = document.createElement("div"); row.className = "cc-row";
    function btn(txt, v) {
      var x = document.createElement("button"); x.type = "button"; x.className = "m-btn m-btn--outlined"; x.textContent = txt;
      x.addEventListener("click", function () { set(v); b.remove(); document.body.classList.remove("has-cc"); removeEventListener("resize", fit); if (v === "yes") load(); });
      return x;
    }
    row.appendChild(btn(L.no, "no")); row.appendChild(btn(L.yes, "yes"));
    b.appendChild(row); document.body.appendChild(b);
    // El botón flotante del celular sube por encima del aviso mientras esté abierto (site.css: .has-cc .site-fab).
    function fit() { document.documentElement.style.setProperty("--cc-h", b.offsetHeight + "px"); }
    document.body.classList.add("has-cc"); fit(); addEventListener("resize", fit);
  }

  var c = get();
  if (c === "yes") load(); else if (c !== "no") banner();
})();
