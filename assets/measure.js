// Medido · medición del propio sitio. Google Analytics 4 y el píxel de Meta se cargan SOLO si hay un ID configurado Y la persona acepta.
// GA4: el ID va abajo. Píxel de Meta: lo agrega el generador del sitio (tools/site_config.json -> meta_pixel_id) como <meta name="medido-meta-pixel">.
// Sin ningún ID no hay aviso, no se carga nada y no se guarda nada.
(function () {
  var GA4_ID = "G-T14ZL11D2C"; // ej. "G-ABC123DEF4"
  var pm = document.querySelector('meta[name="medido-meta-pixel"]'), PIXEL = pm ? (pm.getAttribute("content") || "") : "";
  var cm = document.querySelector('meta[name="medido-clarity"]'), CLARITY = cm ? (cm.getAttribute("content") || "") : "";
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
    en: { t: "I use cookies to measure visits and contact requests.", yes: "Accept", no: "Decline", privacy: "Privacy", privacyHref: "/privacy/", label: "Cookies" },
    he: { t: "אני משתמשת בעוגיות כדי למדוד ביקורים ופניות.", yes: "אישור", no: "דחייה", privacy: "פרטיות", privacyHref: "/he/privacy/", label: "עוגיות" },
    es: { t: "Uso cookies para medir visitas y pedidos de contacto.", yes: "Aceptar", no: "Rechazar", privacy: "Privacidad", privacyHref: "/es/privacy/", label: "Cookies" }
  };
  var lang = (document.documentElement.lang || "en").slice(0, 2), L = T[lang] || T.en, KEY = "medido_ga";
  // Eventos propios del embudo (los disparan lupa.js, site.js y connect.js como "medido:<nombre>"); van iguales a GA4, Meta y Clarity.
  // Un evento que se dispara y no está en esta lista no llega a ningún lado.
  var EV = ["pql_reading_requested", "reading_completed", "reading_repeated", "questions_copied", "manual_requested", "analytics_connected", "reading_shared", "meeting_requested",
    "reread_requested", "coupon_asked", "coupon_calendar", "coupon_payment_started", "coupon_paid", "reading_feedback", "example_played", "spend_calculated"];
  // Precio de la Segunda lectura: el mismo que cobra Lupa (tools/lupa-workers/src/paypal.js, por idioma de la página). coupon_paid = venta.
  var SALE = lang === "he" ? { value: 15, currency: "ILS" } : { value: 5, currency: "USD" };
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // Código anónimo de visitante (1/11, pedido de Medición): al azar, no sale del client_id de GA4 ni de ningún dato de la persona.
  // Solo existe después de «Aceptar» (lo piden loadGa y loadClarity) y nunca con ?interno=1 (ahí el script ya terminó arriba).
  var VID = "";
  function vid() {
    if (VID) return VID;
    try { VID = localStorage.getItem("medido_vid") || ""; } catch (e) {}
    if (!/^v-[0-9a-f]{12}$/.test(VID)) {
      var b = new Uint8Array(6); crypto.getRandomValues(b);
      VID = "v-" + Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem("medido_vid", VID); } catch (e) {}   // si el navegador no deja guardar, vale solo para esta página
    }
    return VID;
  }
  function tier() { try { return sessionStorage.getItem("medido_tier") || ""; } catch (e) { return ""; } }

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
    // visitante_id va en el config: con gtag("set") solo no viajaba en los envíos a GA4 (lo detectó Medición en vivo, 1/11).
    gtag("config", GA4_ID, { anonymize_ip: true, visitante_id: vid() });
    // Evento clave: envío del formulario de contacto (lo dispara contact.js).
    document.addEventListener("medido:lead", function (e) { gtag("event", "generate_lead", Object.assign({ page_lang: lang }, (e && e.detail) || {})); });   // con form_mode y el tramo (contact.js), nunca el correo ni el mensaje
    // El tramo de gasto que calculó la persona queda en esta pestaña y viaja con el pedido de reunión.
    document.addEventListener("medido:spend_calculated", function (e) { try { if (e.detail && e.detail.spend_tier) sessionStorage.setItem("medido_tier", e.detail.spend_tier); } catch (x) {} });
    EV.forEach(function (name) {
      document.addEventListener("medido:" + name, function (e) {
        var p = Object.assign({ page_lang: lang }, (e && e.detail) || {});
        if (name === "meeting_requested" && tier()) p.spend_tier = tier();
        gtag("event", name, p);
      });
    });
    // El pago de la Segunda lectura también va como compra (purchase), con su valor: así GA4 suma ingresos.
    document.addEventListener("medido:coupon_paid", function () {
      gtag("event", "purchase", { value: SALE.value, currency: SALE.currency, page_lang: lang, items: [{ item_id: "second_reading", item_name: "Second reading", price: SALE.value, quantity: 1 }] });
    });
    // Clic en un mail de contacto (solo existe si el sitio está en modo mailto).
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (a) gtag("event", "click_mail", { link_text: a.textContent.trim(), page_lang: lang });
    });
    // Cada clic dentro del sitio (1/11, pedido de Medición): pestañas, acordeones, menú, «ver más», calculadora, lectura. Uno por clic, solo a GA4.
    // Un texto que podría ser un dato de la persona (un mail, un dominio, 4 o más dígitos seguidos) va como "(dato)": la lectura muestra el sitio que escribió.
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest('a, button, summary, [role="button"], [role="tab"]');
      if (!t || t.matches('a[href^="mailto:"]')) return;
      var label = (t.getAttribute("data-track") || t.getAttribute("aria-label") || t.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (/@|[a-z0-9-]+\.[a-z]{2,}|\d{4,}/i.test(label)) label = "(dato)";
      var box = t.parentElement && t.parentElement.closest("[id]"), link = "";
      if (t.tagName === "A" && t.href) { try { var u = new URL(t.href, location.href); if (u.origin === location.origin) link = (u.pathname + u.hash).slice(0, 100); } catch (x) {} }
      gtag("event", "ui_click", { page_lang: lang, label: label, section: box ? box.id : "", kind: t.getAttribute("role") || t.tagName.toLowerCase(), link_url: link });
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
    EV.forEach(function (name) {
      document.addEventListener("medido:" + name, function (e) { window.fbq("trackCustom", name, (e && e.detail) || {}); });
    });
    document.addEventListener("medido:coupon_paid", function () { window.fbq("track", "Purchase", { value: SALE.value, currency: SALE.currency }); });
  }
  // Microsoft Clarity (mapas de calor y grabaciones de sesión): carga estándar, solo con consentimiento, y se le avisa el consentimiento para sus cookies.
  function loadClarity() {
    if (!CLARITY || window.clarity) return;
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    var s = document.createElement("script"); s.async = true; s.src = "https://www.clarity.ms/tag/" + CLARITY; document.head.appendChild(s);
    window.clarity("consent");
    window.clarity("set", "visitante_id", vid());
    EV.forEach(function (name) { document.addEventListener("medido:" + name, function () { window.clarity("event", name); }); });
    document.addEventListener("medido:lead", function () { window.clarity("event", "lead"); });
  }
  function load() { loadGa(); loadMeta(); loadClarity(); }

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
