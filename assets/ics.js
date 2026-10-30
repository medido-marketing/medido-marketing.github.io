/*!
 * ics.js · recordatorio de calendario de «Vuelve a leer tu sitio · Medido» (archivo nuevo, no cargado en ninguna página todavía).
 *
 * Qué hace: una función PURA, build({lang, domain, now}), que devuelve el texto de un archivo .ics con UN evento,
 * a los 7 días de «now», a las 10:00 hora local (hora «flotante»: el calendario la interpreta en la zona de quien lo
 * abre; no hay zona horaria escrita en el archivo). Título en EN/HE/ES; el dominio va en la descripción, con el enlace a
 * https://marketingmedido.com/. No lleva ningún dato personal: ni nombre, ni mail, ni teléfono, ni ciudad. No usa red,
 * no guarda nada, no toca el DOM.
 *
 * Cómo se conectaría con un botón «Guardar recordatorio» (cuando la otra sesión termine con lupa.js; NADA de esto está hecho):
 *   1. build_web.py: cargar este archivo con <script src="/assets/ics.js" defer></script> en la misma página que lupa.js.
 *   2. content.py: una clave nueva por idioma en el bloque js de la lectura, junto a next_btn:
 *        EN 'save_reminder': 'Save a reminder'   ES 'save_reminder': 'Guardar recordatorio'   HE 'save_reminder': 'לשמור תזכורת'
 *   3. lupa.js: junto al botón de la relectura (J.next_btn), cuando hay una lectura terminada:
 *        var b = el("button", "m-btn m-btn--outlined", J.save_reminder); b.type = "button";
 *        b.addEventListener("click", function () {
 *          var host = new URL(r.url || lastUrl).hostname;                        // el dominio ya leído, nada más
 *          var text = MedidoIcs.build({ lang: LANG, domain: host, now: new Date() });
 *          var url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
 *          var a = document.createElement("a"); a.href = url; a.download = MedidoIcs.filename(host);
 *          document.body.appendChild(a); a.click(); a.remove();
 *          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
 *        });
 *      Todo ocurre en el navegador: no se manda nada al servidor. Si se quiere medir cuánta gente lo usa, contar el clic
 *      sin el dominio (nunca mandar el dominio junto con el evento).
 *   4. Sin verificar: cómo reacciona cada navegador y cada app de calendario al descargar el blob (en iOS Safari y en
 *      Gmail/Outlook web no está probado); si alguno falla, caer a un enlace data:text/calendar.
 *
 * Prueba: node tools/lupa/pase/test_ics.js
 *
 * Uso en Node:  const { build } = require("./ics.js");   En el navegador: window.MedidoIcs.build(...)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MedidoIcs = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SITE_URL = "https://marketingmedido.com/";
  var DAYS = 7, HOUR = 10, MINUTES = 30;      // 7 días, a las 10:00, de 30 minutos
  var CRLF = "\r\n";

  var TEXT = {
    en: { title: "Read your site again · Medido",
          desc: "Second reading of {d}: US$5 with the coupon from your first reading. Read it again at {u} and see what changed." },
    he: { title: "קראו שוב את האתר שלכם · Medido",
          desc: "קריאה שנייה של {d}: 15 ₪ עם הקופון מהקריאה הראשונה. קראו שוב בכתובת {u} וראו מה השתנה." },
    es: { title: "Vuelve a leer tu sitio · Medido",
          desc: "Segunda lectura de {d}: US$5 con el cupón de tu primera lectura. Vuelve a leerlo en {u} y mira qué cambió." }
  };

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }

  /** Deja solo el dominio: sin esquema, credenciales, puerto, ruta ni consulta; minúsculas; solo letras, números, punto y guion. */
  function normalizeDomain(input) {
    var s = String(input == null ? "" : input).trim().toLowerCase();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");     // esquema
    s = s.split(/[\/?#\\]/)[0];                        // ruta, consulta, fragmento
    s = s.replace(/^.*@/, "");                         // credenciales
    s = s.replace(/:\d*$/, "");                        // puerto
    s = s.replace(/[^\p{L}\p{N}.-]/gu, "");            // todo lo demás (incluye controles y saltos de línea)
    s = s.replace(/^[.-]+|[.-]+$/g, "");
    if (!s || s.length > 253) throw new Error("ics: dominio inválido");
    return s;
  }

  /** Escapa un valor TEXT (RFC 5545 §3.3.11): barra, punto y coma, coma y saltos de línea. Quita los controles. */
  function escapeText(s) {
    return String(s)
      .replace(/\r\n|\r|\n/g, "\u2028")                    // marca temporal de salto, se convierte al final
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")  // controles (no deben llegar a un archivo .ics)
      .replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,")
      .replace(/\u2028/g, "\\n");
  }

  function utf8Len(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }

  /** Pliega una línea a 75 octetos UTF-8 como máximo por línea física (RFC 5545 §3.1): CRLF + un espacio de continuación.
   *  Nunca corta en medio de un carácter. */
  function fold(line) {
    var out = [], cur = "", bytes = 0, limit = 75;
    for (var ch of line) {                                   // recorre por puntos de código
      var n = utf8Len(ch.codePointAt(0));
      if (bytes + n > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
      cur += ch; bytes += n;
    }
    out.push(cur);
    return out.join(CRLF);
  }

  function localStamp(d) {      // AAAAMMDDTHHMMSS, hora local, sin zona (flotante)
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }
  function utcStamp(d) {        // AAAAMMDDTHHMMSSZ
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }

  /** Hash de 53 bits (cyrb53), solo para que el UID sea estable: el mismo dominio y el mismo día dan el mismo UID,
   *  así guardar dos veces el mismo recordatorio lo reemplaza en vez de duplicarlo. No es criptográfico ni se usa como secreto. */
  function hash(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  /**
   * @param {{lang?: "en"|"he"|"es", domain: string, now?: Date}} opts
   *   now: el momento de la lectura (por defecto, ahora; pasarlo explícito vuelve la función determinista).
   * @returns {string} el contenido del .ics, con CRLF en todas las líneas y al final.
   */
  function build(opts) {
    opts = opts || {};
    var lang = TEXT[opts.lang] ? opts.lang : "en";
    var domain = normalizeDomain(opts.domain);
    var now = opts.now instanceof Date ? opts.now : new Date();
    if (isNaN(now.getTime())) throw new Error("ics: fecha inválida");

    // 7 días después, a las 10:00 locales. new Date(a, m, d + 7, ...) respeta los cambios de horario de verano.
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS, HOUR, 0, 0);
    var end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), HOUR, MINUTES, 0);
    var t = TEXT[lang];
    var title = t.title;
    var desc = t.desc.replace("{d}", domain).replace("{u}", SITE_URL);
    var uid = "lupa-" + hash(domain + "|" + localStamp(start)) + "@marketingmedido.com";

    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Medido//Lupa recordatorio//" + lang.toUpperCase(),
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + utcStamp(now),
      "DTSTART:" + localStamp(start),
      "DTEND:" + localStamp(end),
      "SUMMARY;LANGUAGE=" + lang + ":" + escapeText(title),
      "DESCRIPTION;LANGUAGE=" + lang + ":" + escapeText(desc),
      "URL:" + SITE_URL,
      "TRANSP:TRANSPARENT",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:PT0S",
      "DESCRIPTION:" + escapeText(title),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.map(fold).join(CRLF) + CRLF;
  }

  /** Nombre de archivo seguro para la descarga. */
  function filename(domain) {
    return "medido-relectura-" + normalizeDomain(domain).replace(/[^a-z0-9.-]/g, "_") + ".ics";
  }

  return { build: build, filename: filename, normalizeDomain: normalizeDomain, escapeText: escapeText, fold: fold };
});
