// Medido · comportamiento general. Nada se anima al hacer scroll; el anillo de lectura solo informa dónde estás.
(function () {
  var d = document, body = d.body;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var all = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var cfgEl = $("#cfg"), cfg = cfgEl ? JSON.parse(cfgEl.textContent) : null;

  // Cambiar de idioma conserva la lectura en curso o terminada: lupa.js deja el sitio leído en data-site y la otra versión la retoma con ?site= (misma caché del Worker).
  all("[data-go]").forEach(function (b) { b.addEventListener("click", function () { var s = b.getAttribute("data-site"); location.href = b.getAttribute("data-go") + (s ? "?site=" + encodeURIComponent(s) + "&re=1" : ""); }); });

  // menú en celular: el botón abre y cierra la lista de secciones; un enlace o Escape la cierran
  var bar = $(".bar"), mb = $(".menu-btn");
  if (bar && mb) {
    var setMenu = function (on) { bar.classList.toggle("menu-open", on); mb.setAttribute("aria-expanded", on ? "true" : "false"); };
    mb.addEventListener("click", function () { setMenu(!bar.classList.contains("menu-open")); });
    all("#sitenav a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && bar.classList.contains("menu-open")) { setMenu(false); mb.focus(); } });
  }

  var ring = $("#read-ring");
  function readMeter() {
    var h = d.documentElement, max = h.scrollHeight - h.clientHeight;
    var p = max > 0 ? Math.min(100, Math.max(0, Math.round((h.scrollTop || body.scrollTop) / max * 100))) : 0;
    ring.style.setProperty("--p", p);
  }
  if (ring) { readMeter(); addEventListener("scroll", readMeter, { passive: true }); addEventListener("resize", readMeter); }

  function copyText(txt, btn, done) {
    function ok() { if (btn) { var t = btn.getAttribute("data-label") || btn.textContent; btn.setAttribute("data-label", t); btn.textContent = done || "✓"; setTimeout(function () { btn.textContent = t; }, 1800); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { fallback(); }); else fallback();
    function fallback() { var ta = d.createElement("textarea"); ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0"; d.body.appendChild(ta); ta.select(); try { d.execCommand("copy"); ok(); } catch (e) {} ta.remove(); }
  }
  window.medidoCopy = copyText;

  var cp = $("#copy"); if (cp && cfg) cp.addEventListener("click", function () { copyText(cfg.email, cp, cp.getAttribute("data-done")); });
  var ck = $("#copykit"); if (ck && cfg) ck.addEventListener("click", function () {
    var lines = cfg.kit.map(function (q, i) { return (i + 1) + ". " + q; }).join("\n");
    copyText(lines, ck, cfg.js.copied);
    try { d.dispatchEvent(new CustomEvent("medido:questions_copied", { detail: { page_lang: cfg.lang, what: "kit" } })); } catch (e) {}
  });

  // calculadora de ajuste al gasto
  var sp = $("#spend"), out = $("#calc-out");
  function fmt(n) { return n.toLocaleString({ he: "he-IL", es: "es" }[cfg.lang] || "en-US"); }
  // un texto del tramo: reemplaza las cifras y pasa **así** a negrita, sin usar innerHTML
  function rich(el, s) {
    s.split("**").forEach(function (part, i) {
      if (!part) return;
      if (i % 2) { var b = d.createElement("b"); b.textContent = part; el.appendChild(b); } else el.appendChild(d.createTextNode(part));
    });
    return el;
  }
  function para(s) { var p = d.createElement("p"); p.className = "t-body"; return rich(p, s); }
  var calcTimer, calcSent = 0;
  if (sp && out && cfg) sp.addEventListener("input", function () {
    var v = parseInt((sp.value || "").replace(/[^0-9]/g, ""), 10);
    out.textContent = "";
    if (!v) { out.appendChild(para(cfg.calc.none)); return; }
    var f = cfg.fee, n = 1;
    while (n <= f.cuts.length && v >= f.cuts[n - 1]) n++;        // cinco tramos: t1 … t5
    var t = cfg.calc["t" + n], nums = { s: fmt(v), p: Math.round(f.diag / v * 100), q: Math.round(f.quarter / v * 100), g: Math.round(f.watch / v * 100) };
    var fill = function (s) { return s.replace(/\{([spqg])\}/g, function (m, k) { return nums[k]; }); };
    out.appendChild(para(fill(t.lead)));
    var ul = d.createElement("ul"); ul.className = "calc-list";
    t.items.forEach(function (it) { var li = d.createElement("li"); ul.appendChild(rich(li, fill(it))); });
    out.appendChild(ul);
    if (t.tail) out.appendChild(para(fill(t.tail)));
    // evento (solo llega a Analytics, Meta y Clarity si aceptaron las cookies): qué gasto escribió y en qué tramo cayó,
    // cuando deja de escribir 1,5 s y solo si el número cambió
    clearTimeout(calcTimer);
    calcTimer = setTimeout(function () {
      if (v === calcSent) return; calcSent = v;
      var lo = n > 1 ? f.cuts[n - 2] : 0, hi = n <= f.cuts.length ? f.cuts[n - 1] : null;
      try { d.dispatchEvent(new CustomEvent("medido:spend_calculated", { detail: { page_lang: cfg.lang, spend: v, currency: f.cur, spend_tier: "t" + n, spend_range: lo + "-" + (hi === null ? "+" : hi) } })); } catch (e) {}
    }, 1500);
  });

  // ventanas (dialog nativo): el enlace abre la ventana; sin JS sigue llevando a la página. Cierra con la X, el botón, Escape o un toque afuera.
  all("[data-dialog]").forEach(function (a) {
    var dlg = $("#" + a.getAttribute("data-dialog"));
    if (!dlg || typeof dlg.showModal !== "function") return;
    a.addEventListener("click", function (e) { e.preventDefault(); dlg.showModal(); a.setAttribute("aria-expanded", "true"); });
    dlg.addEventListener("close", function () { a.removeAttribute("aria-expanded"); a.focus(); });
    all("[data-close]", dlg).forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  });

  // botón de leer del encabezado: en la portada se muestra solo cuando la caja de lectura salió de la vista
  var barCta = $(".bar-cta"), box = $("#reader");
  if (barCta && box) {
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { barCta.classList.toggle("is-on", !es[0].isIntersecting); }).observe(box);
    else barCta.classList.add("is-on");
  }

  // botón fijo del celular: aparece al pasar la portada y se va en el cierre
  var fab = $("#fab"), hero = $("#read"), end = $("#contact");
  if (fab && hero && end && "IntersectionObserver" in window) {
    var inHero = true, inEnd = false;
    var upd = function () { fab.classList.toggle("on", !inHero && !inEnd); };
    new IntersectionObserver(function (es) { inHero = es[0].isIntersecting; upd(); }).observe(hero);
    new IntersectionObserver(function (es) { inEnd = es[0].isIntersecting; upd(); }).observe(end);
  }
})();
