// Medido · página /connect/. Habla con /api/google/status, /start, /disconnect y /summary del servidor de Lupa.
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

  var qs = new URLSearchParams(location.search), back = qs.get("google"), motivo = qs.get("motivo"), clave = qs.get("clave");
  // el Worker de Lupa en su dominio (cfg.gapi); la cookie de la conexión viaja con credentials: "include" (9/11)
  var GAPI = cfg.gapi || "";
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
  function motivoText(m, k) { return ({ g_denied: g.e_denied, g_scopes: g.e_scopes, g_state: g.e_state, g_off: g.e_off })[k] || ({ denegado: g.e_denied, alcances: g.e_scopes, estado: g.e_state, apagado: g.e_off })[m] || g.e_fail; }   // clave = la de textos.py de Lupa (g_…); motivo, la de antes

  function paint(focusName) {
    var p = S.phase;
    R("load").hidden = p !== "load";
    R("lead2").hidden = p === "off";
    R("off").hidden = p !== "off";
    R("main").hidden = p === "load" || p === "off";
    R("consent").hidden = !(p === "idle" || p === "error");
    R("busy").hidden = p !== "connecting";
    R("ok").hidden = p !== "connected";
    R("sum").hidden = p !== "connected";
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
    fetch(GAPI + "/api/google/start?" + new URLSearchParams({ site: u, lang: cfg.lang, format: "json" }), { headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" })
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
    fetch(GAPI + "/api/google/disconnect", { method: "POST", headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (o) {
        b.removeAttribute("aria-disabled"); b.textContent = b.getAttribute("data-label");
        if (o.ok && o.j.ok) { SUM.gen++; SUM.busy = false; clearSum(); SUM.prop = null; SUM.cont = null; S.phase = "idle"; S.msg = ""; S.st = null; S.note = o.j.revocado_en_google === false ? g.disc_nog : g.disc_ok; paint("note"); }
        else { S.note = ""; S.phase = "connected"; paint(); var e = R("note"); e.hidden = false; e.textContent = o.j.error || g.e_fail; }
      })
      .catch(function () { b.removeAttribute("aria-disabled"); b.textContent = b.getAttribute("data-label"); var e = R("note"); e.hidden = false; e.textContent = g.e_net; });
  });
  R("disc").setAttribute("data-label", R("disc").textContent);

  // ---------- «Lo que leí de tu cuenta» (16/11): GET /api/google/summary ----------
  // Se pide UNA vez al cargar conectada y al elegir de una lista (cupo: 6 por hora por conexión); sin reintentos automáticos.
  // Son datos de la cuenta de la persona: solo en memoria de la página (nada en localStorage ni sessionStorage) y siempre con textContent.
  var SUM = { busy: false, prop: null, cont: null, gen: 0 };
  var NF = LOCALE[cfg.lang] || "en-US";
  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function ltr(txt) { var b = el("bdi", null, txt == null ? "" : String(txt)); b.setAttribute("dir", "ltr"); return b; }
  function nf(n) { return typeof n === "number" ? n.toLocaleString(NF) : "–"; }
  function dec(n) { return typeof n === "number" ? n.toLocaleString(NF, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "–"; }
  function pctText(f) { return typeof f === "number" ? dec(f * 100) + "%" : "–"; }
  function isoDate(t) { try { return new Date(t + "T12:00:00Z").toLocaleDateString(NF, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); } catch (e) { return t || ""; } }
  function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); }
  function para(host, txt) { host.appendChild(el("p", "t-support", txt)); }
  function kv(dl, label, val) { var w = el("div"); w.appendChild(el("dt", "t-label", label)); var dd = el("dd"); if (val && val.nodeType) dd.appendChild(val); else dd.textContent = val == null ? "" : String(val); w.appendChild(dd); dl.appendChild(w); }
  function nums(items) { var box = el("div", "gnums"); items.forEach(function (it) { var c = el("div"); c.appendChild(el("b", null, it[1])); c.appendChild(el("span", null, it[0])); box.appendChild(c); }); return box; }
  function table(caption, heads, rows) {
    var wrap = el("div", "gtbl-wrap"); wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", caption); wrap.tabIndex = 0;
    var t = el("table", "gtbl"), tr = el("tr"); t.appendChild(el("caption", "m-sr", caption));
    var th = el("thead"); heads.forEach(function (h) { var c = el("th", null, h[0]); c.setAttribute("scope", "col"); tr.appendChild(c); }); th.appendChild(tr); t.appendChild(th);
    var tb = el("tbody"); rows.forEach(function (r) { var x = el("tr"); r.forEach(function (v, i) { var c = el("td", heads[i][1] ? "n" : null); if (v && v.nodeType) c.appendChild(v); else c.textContent = v == null ? "" : String(v); x.appendChild(c); }); tb.appendChild(x); });
    t.appendChild(tb); wrap.appendChild(t); return wrap;
  }
  function chooser(host, txt, opts, pick) {
    para(host, txt); var box = el("div", "gchoose");
    (opts || []).forEach(function (o) {
      var b = el("button", "m-chip", o.nombre || o.id); b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { if (SUM.busy) return; pick(o.id); }); box.appendChild(b);
    });
    host.appendChild(box);
  }
  function renderGA(host, a) {
    host.textContent = "";
    if (a.estado === "elegir") return chooser(host, g.sm_choose_ga, a.opciones, function (id) { SUM.prop = id; loadSummary(); });
    if (a.estado === "sin_acceso") return para(host, g.sm_ga_none);
    if (a.estado !== "leido" && a.estado !== "parcial") return para(host, g.sm_unread);
    var dl = el("dl", "gkv");
    if (a.propiedad) { var pv = d.createDocumentFragment(); pv.appendChild(d.createTextNode((a.propiedad.nombre || "") + " · ")); pv.appendChild(ltr(a.propiedad.id)); kv(dl, g.sm_prop, pv); }
    if (a.flujos && a.flujos.length) {
      var ul = el("ul"); a.flujos.forEach(function (f) { var li = el("li"); li.appendChild(d.createTextNode((f.nombre || "") + " · ")); li.appendChild(ltr(f.id_de_medicion || "")); if (f.dominio) { li.appendChild(d.createTextNode(" · ")); li.appendChild(ltr(f.dominio)); } ul.appendChild(li); });
      kv(dl, g.sm_streams, ul);
    }
    if (a.eventos_clave) kv(dl, g.sm_keyev, a.eventos_clave.length ? ltr(a.eventos_clave.join(", ")) : g.sm_keyev_none);
    host.appendChild(dl);
    var t = a.totales;
    if (t) { var dd = (SUM.dias || 28); host.appendChild(el("p", "t-label", fill(g.sm_days, { n: dd }))); host.appendChild(nums([[g.sm_sessions, nf(t.sesiones)], [g.sm_views, nf(t.vistas)], [g.sm_users, nf(t.usuarios_activos)]])); }
    if (a.aproximado) para(host, g.sm_approx);
    if (a.estado === "parcial" || !a.eventos_clave || !t) para(host, g.sm_partial);
  }
  function renderGTM(host, t) {
    host.textContent = "";
    if (t.estado === "elegir") return chooser(host, g.sm_choose_gtm, t.opciones, function (id) { SUM.cont = id; loadSummary(); });
    if (t.estado === "sin_acceso") return para(host, g.sm_gtm_none);
    if (t.estado === "no_encontrado") return para(host, fill(g.sm_gtm_nf, { id: (t.no_encontrados || []).join(", ") }));
    if (t.estado !== "leido") return para(host, g.sm_unread);
    (t.contenedores || []).forEach(function (c) {
      var box = el("div", "gcont"), h = el("h4"); h.appendChild(d.createTextNode(g.sm_container + ": " + (c.nombre || "") + " · ")); h.appendChild(ltr(c.id)); box.appendChild(h);
      if (c.estado === "no_web") { para(box, g.sm_gtm_noweb); host.appendChild(box); return; }
      if (c.estado !== "leido") { para(box, g.sm_gtm_noread); host.appendChild(box); return; }
      var dl = el("dl", "gkv"); if (c.version) kv(dl, g.sm_version, ltr(c.version.nombre || ("v" + c.version.numero))); box.appendChild(dl);
      var tags = c.etiquetas || [];
      if (!tags.length) para(box, g.sm_tags_none);
      else {
        box.appendChild(table(g.sm_tags, [[g.sm_t_name], [g.sm_t_type], [g.sm_t_trig]], tags.map(function (e) {
          var nm = d.createDocumentFragment(); nm.appendChild(d.createTextNode(e.nombre || "")); if (e.pausada) nm.appendChild(d.createTextNode(" (" + g.sm_paused + ")"));
          return [nm, e.tipo_nombre || e.tipo || "", e.con_activador ? g.sm_trig_yes : g.sm_trig_no];
        })));
        if (typeof c.total_etiquetas === "number" && c.total_etiquetas > tags.length) para(box, fill(g.sm_tags_more, { n: tags.length, total: c.total_etiquetas }));
      }
      host.appendChild(box);
    });
  }
  function renderSC(host, s) {
    host.textContent = "";
    if (s.estado === "sin_permiso") return para(host, g.sm_sc_noperm);
    if (s.estado === "sin_propiedad") return para(host, g.sm_sc_noprop);
    if (s.estado !== "leido" && s.estado !== "parcial") return para(host, g.sm_unread);
    var dl = el("dl", "gkv");
    if (s.propiedad) kv(dl, g.sm_prop, ltr(s.propiedad));
    if (s.periodo) kv(dl, g.sm_period, isoDate(s.periodo.desde) + " – " + isoDate(s.periodo.hasta));
    host.appendChild(dl);
    var t = s.totales;
    if (t) host.appendChild(nums([[g.sm_clicks, nf(t.clics)], [g.sm_impr, nf(t.impresiones)], [g.sm_ctr, pctText(t.ctr)], [g.sm_pos, dec(t.posicion_media)]]));
    if (s.terminos && s.terminos.length) host.appendChild(table(g.sm_terms, [[g.sm_term], [g.sm_clicks, 1], [g.sm_impr, 1]], s.terminos.map(function (x) { return [x.termino || "", nf(x.clics), nf(x.impresiones)]; })));
    if (s.estado === "parcial" || !t) para(host, g.sm_partial);
  }
  function sumShow(what) { R("sum-load").hidden = what !== "load"; R("sum-err").hidden = what !== "err"; R("sum-body").hidden = what !== "body"; }
  function sumError(msg, canRetry) { R("sum-errtxt").textContent = msg; R("sum-retry").hidden = !canRetry; sumShow("err"); }
  function clearSum() { ["sum-ga", "sum-gtm", "sum-sc"].forEach(function (n) { R(n).textContent = ""; }); R("sum-errtxt").textContent = ""; }
  function renderSummary(j) {
    SUM.dias = j.dias;
    renderGA(R("sum-ga"), j.analytics || {}); renderGTM(R("sum-gtm"), j.tag_manager || {}); renderSC(R("sum-sc"), j.search_console || {});
    sumShow("body");
  }
  function loadSummary() {
    if (SUM.busy) return; SUM.busy = true; var mine = ++SUM.gen; sumShow("load");
    var q = new URLSearchParams({ lang: cfg.lang }); if (SUM.prop) q.set("property", SUM.prop); if (SUM.cont) q.set("container", SUM.cont);
    fetch(GAPI + "/api/google/summary?" + q, { headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, j: j || {} }; }); })
      .then(function (o) {
        if (mine !== SUM.gen) return;   // se desconectó mientras tanto: se ignora la respuesta
        SUM.busy = false;
        if (o.ok && o.j.ok) { renderSummary(o.j); return; }
        if (o.status === 401) { clearSum(); S.phase = "error"; S.msg = o.j.error || g.e_fail; S.st = null; paint("err"); return; }   // sin conexión: vuelve a «sin conectar»
        sumError(o.j.error || g.sm_e_fail, o.status !== 429);   // 429 (cupo): sin reintento
      })
      .catch(function () { if (mine !== SUM.gen) return; SUM.busy = false; sumError(g.sm_e_net, true); });
  }
  R("sum-retry").addEventListener("click", function () { loadSummary(); });

  // arranque: ¿la función está encendida? ¿ya hay una conexión de este navegador?
  fetch(GAPI + "/api/google/status?lang=" + cfg.lang, { headers: { Accept: "application/json" }, cache: "no-store", credentials: "include" })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (j) {
      if (!j || j.configurado !== true) { S.phase = "off"; paint(); return; }
      S.st = j;
      var focus = null;
      if (j.conectado) { S.phase = "connected"; if (back) { focus = "ok"; try { d.dispatchEvent(new CustomEvent("medido:analytics_connected", { detail: { page_lang: cfg.lang, sc: j.search_console === true ? "yes" : "no" } })); /* sc: si dejó Search Console marcado (9/11, Medición); sin datos personales */ } catch (e) {} } if (j.sitio) store("medido_gsite", j.sitio); }
      else if (back === "error") { S.phase = "error"; S.msg = motivoText(motivo, clave); focus = "err"; }
      else if (back === "ok") { S.phase = "error"; S.msg = g.e_fail; focus = "err"; }
      else S.phase = "idle";
      if (back) history.replaceState(null, "", location.pathname + location.hash);
      paint(focus);
      if (S.phase === "connected") loadSummary();
    })
    .catch(function () { S.phase = "off"; paint(); });
})();
