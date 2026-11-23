// «Findings»: progreso de lectura, índice lateral y filtros del índice. Sin dependencias.
(function () {
  // Aviso de idioma: solo a quien entra desde el menú en español (?from=es); se recuerda durante la sesión para el resto de la sección.
  var from = null;
  try { from = new URLSearchParams(location.search).get("from"); if (from) sessionStorage.setItem("fx_from", from); else from = sessionStorage.getItem("fx_from"); } catch (e) {}
  var note = from ? document.getElementById("lang-note-" + from) : null;
  if (note) note.hidden = false;
  var bar = document.getElementById("readbar");
  if (bar) {
    var onScroll = function () {
      var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      bar.style.setProperty("--p", max > 0 ? Math.min(100, Math.round(h.scrollTop / max * 100)) : 0);
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }
  var ids = (document.body.getAttribute("data-sections") || "").split(",").filter(Boolean);
  var rail = document.querySelectorAll("#rail a"), tabs = document.querySelectorAll("#tabs a");
  if (ids.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = ids.indexOf(e.target.id);
        rail.forEach(function (a, j) { if (j === i) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
        tabs.forEach(function (a, j) { a.setAttribute("aria-selected", j === i ? "true" : "false"); });
        if (tabs[i] && tabs[i].offsetParent) tabs[i].parentNode.scrollTo({ left: tabs[i].offsetLeft - 16, behavior: "smooth" });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
  var filt = document.querySelectorAll("[data-filter]");
  filt.forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.getAttribute("data-filter");
      filt.forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      document.querySelectorAll(".entry").forEach(function (e) { e.hidden = !(v === "all" || e.getAttribute("data-topic") === v); });
    });
  });
})();
