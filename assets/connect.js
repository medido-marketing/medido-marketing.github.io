// Medido · página /connect/. Habla con /api/google/status, /start y /disconnect del servidor de Lupa.
// Todo texto que viene del servidor se inserta con textContent. Si el servidor no responde o la función está apagada, solo se ofrece escribir.
(function () {
  var d = document, root = d.getElementById("gpage"); if (!root) return;
  var cfgEl = d.getElementById("cfg"); if (!cfgEl) return;
  var cfg = JSON.parse(cfgEl.textContent), g = cfg.g;
  var $ = function (s) { return d.querySelector(s); };
  var R = function (n) { return root.querySelector('[data-r="' + n + '"]'); };
  var PATH = { en: "/connect/", he: "/he/connect/", es: "/es/connect/" };
  var LOCALE = { en: "en-US", he: "he-IL", es: "es" };
  var S = { phase: "load", st: null, msg: "", agreed: false };

  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  var qs = new URLSearchParams(location.search), back = qs.get("google"), motivo = qs.get("motivo");
  // Google vuelve a la dirección que configura el servidor; si el visitante venía de otro idioma, lo devolvemos a su página.
  var want = load("medido_glang");
  if (back && want && want !== cfg.lang && PATH[want]) { location.replace(PATH[want] + location.search); return; }

  var site = $("#g-site"), box = $("#g-ok"), ckerr = $("#g-ckerr"), btn = R("connect"), alt = R("alt");
  var site0 = (qs.get("site") || "").slice(0, 300) || load("medido_gsite") || "";
  site.value = site0;

  // un solo camino alternativo: los datos a mano por mail
  function altHref() {
    var u = (site.value || "").trim();
    return (cfg.contact ? cfg.contact + "?" : "mailto:" + cfg.email + "?") + "subject=" + encodeURIComponent(g.alt_subject) + "&body=" + encodeURIComponent(g.alt_body.replace("{url}", u));
  }
  alt.href = altHref();
  site.addEventListener("input", function () { alt.href = altHref(); site.removeAttribute("aria-invalid"); site.parentNode.classList.remove("m-field--error"); });
  // al cambiar de idioma, el sitio viaja en la dirección
  Array.prototype.forEach.call(d.querySelectorAll("[data-go]"), function (b) {
    b.addEventListener("click", function () { var u = (site.value || "").trim(); if (u) b.setAttribute("data-go", b.getAttribute("data-go").split("?")[0] + "?site=" + encodeURIComponent(u)); }, true);
  });

  function withPerm(node, txt) {
    node.textContent = "";
    txt.split("{perm}").forEach(function (part, i) {
      if (i) { var a = d.createElement("a"); a.href = "https://myaccount.google.com/permissions"; a.target = "_blank"; a.rel = "noopener noreferrer"; a.setAttribute("dir", "ltr"); a.textContent = "myaccount.google.com/permissions"; node.appendChild(a); }
      node.appendChild(d.createTextNode(part));
    });
  }
  function leftText(days) {
    if (!(days >= 1)) return g.left_less;
    var n = Math.round(days); return n === 1 ? g.left_one : g.left_many.replace("{n}", n);
  }
  function fmtDate(sec) { try { return new Date(sec * 1000).toLocaleDateString(LOCALE[cfg.lang] || "en-US", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } }
  function host(u) { try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : "https://" + u).host; } catch (e) { return u || ""; } }
  function motivoText(m) { return ({ denegado: g.e_denied, alcances: g.e_scopes, estado: g.e_state, apagado: g.e_off })[m] || g.e_fail; }

  function paint(focusName) {
    var p = S.phase;
    R("load").hidden = p !== "load";
    R("lead2").hidden = p === "off";
    R("off").hidden = p !== "off";
    R("main").hidden = p === "load" || p === "off";
    R("consent").hidden = !(p === "idle" || p === "error");
    R("busy").hidden = p !== "connecting";
    R("ok").hidden = p !== "connected";
    R("err").hidden = !(p === "error" && S.msg);
    R("errtxt").textContent = S.msg || "";
    var n = R("note"); n.hidden = !S.note;
    if (S.note) withPerm(n, S.note); else n.textContent = "";
    if (p === "connected" && S.st) {
      R("left").textContent = leftText(S.st.dias_restantes);
      R("exp").textContent = S.st.vence ? g.expires.replace("{date}", fmtDate(S.st.vence)) : "";
      var h = R("host"); h.textContent = ""; var parts = g.site_line.split("{host}");
      h.appendChild(d.createTextNode(parts[0])); var b = d.createElement("bdi"); b.setAttribute("dir", "ltr"); b.textContent = host(S.st.sitio); h.appendChild(b); h.appendChild(d.createTextNode(parts[1] || ""));
    }
    if (focusName) { var t = focusName === "h1" ? $("#gh1") : R(focusName); if (t) t.focus({ preventScroll: false }); }
  }

  function setAgree(on) {
    S.agreed = on;
    btn.setAttribute("aria-disabled", on ? "false" : "true");
    if (on) { ckerr.hidden = true; box.removeAttribute("aria-invalid"); }
  }
  box.addEventListener("change", function () { setAgree(box.checked); });

  function fail(msg) { S.phase = "error"; S.msg = msg; S.note = ""; paint("err"); }

  btn.addEventListener("click", function () {
    if (S.phase !== "idle" && S.phase !== "error") return;
    var u = (site.value || "").trim();
    if (!u) { site.setAttribute("aria-invalid", "true"); site.parentNode.classList.add("m-field--error"); var hp = $("#g-site-help"); hp.textContent = g.site_need; site.focus(); return; }
    if (!S.agreed) { ckerr.hidden = false; box.setAttribute("aria-invalid", "true"); box.focus(); return; }
    S.phase = "connecting"; S.msg = ""; S.note = ""; paint("busy");
    store("medido_gsite", u); store("medido_glang", cfg.lang);
    fetch("/api/google/start?" + new URLSearchParams({ site: u, lang: cfg.lang, format: "json" }), { headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        var url = null; try { url = new URL(o.j.url); } catch (e) {}
        if (o.ok && url && /^https?:$/.test(url.protocol)) { location.assign(url.href); return; }
        fail(o.j.error || g.e_fail);
      })
      .catch(function () { fail(g.e_net); });
  });

  R("disc").addEventListener("click", function () {
    var b = R("disc"); if (b.getAttribute("aria-disabled") === "true") return;
    b.setAttribute("aria-disabled", "true"); b.textContent = g.disconnecting;
    fetch("/api/google/disconnect", { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        b.removeAttribute("aria-disabled"); b.textContent = b.getAttribute("data-label");
        if (o.ok && o.j.ok) { S.phase = "idle"; S.msg = ""; S.st = null; S.note = o.j.revocado_en_google === false ? g.disc_nog : g.disc_ok; paint("note"); }
        else { S.note = ""; S.phase = "connected"; paint(); var e = R("note"); e.hidden = false; e.textContent = o.j.error || g.e_fail; }
      })
      .catch(function () { b.removeAttribute("aria-disabled"); b.textContent = b.getAttribute("data-label"); var e = R("note"); e.hidden = false; e.textContent = g.e_net; });
  });
  R("disc").setAttribute("data-label", R("disc").textContent);

  // arranque: ¿la función está encendida? ¿ya hay una conexión de este navegador?
  fetch("/api/google/status?lang=" + cfg.lang, { headers: { Accept: "application/json" }, cache: "no-store" })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (j) {
      if (!j || j.configurado !== true) { S.phase = "off"; paint(); return; }
      S.st = j;
      var focus = null;
      if (j.conectado) { S.phase = "connected"; if (back) focus = "ok"; if (j.sitio) store("medido_gsite", j.sitio); }
      else if (back === "error") { S.phase = "error"; S.msg = motivoText(motivo); focus = "err"; }
      else if (back === "ok") { S.phase = "error"; S.msg = g.e_fail; focus = "err"; }
      else S.phase = "idle";
      if (back) history.replaceState(null, "", location.pathname + location.hash);
      paint(focus);
    })
    .catch(function () { S.phase = "off"; paint(); });
})();
