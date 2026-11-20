"""Tarea diaria de «Aprende» / «Learn» (repo público del sitio). Sin dependencias.
Lee calendario.json de la rama «cola» (carpeta ETAPAS), calcula cuántos artículos ya salieron (UTC) y copia la etapa correspondiente (kN) sobre
findings/ y los bloques «learn» de sitemap.xml y llms.txt. Lo arma el generador del sitio; acá solo se elige la etapa."""
import datetime, json, os, pathlib, re, shutil

ETAPAS = pathlib.Path(os.environ.get("ETAPAS", "../cola"))   # la rama «cola» del repo público, descargada aparte
cal = json.loads((ETAPAS / "calendario.json").read_text(encoding="utf-8"))
today = datetime.date.fromisoformat(os.environ["HOY"]) if os.environ.get("HOY") else datetime.datetime.now(datetime.timezone.utc).date()
n = 0
if cal.get("inicio"):
    d = (today - datetime.date.fromisoformat(cal["inicio"])).days
    if d >= 0:
        n = min(int(cal["total"]), d // int(cal["cada_dias"]) + 1)
src = ETAPAS / f"k{n}"
for d in ("findings",):
    shutil.rmtree(d, ignore_errors=True)
    if (src / d).exists():
        shutil.copytree(src / d, d)


def swap(path, frag_file, end_prefix):
    p = pathlib.Path(path)
    lines = [l for l in (src / frag_file).read_text(encoding="utf-8").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    block = "<!-- learn:start -->" + "".join("\n" + l for l in lines) + "\n" + end_prefix + "<!-- learn:end -->"
    t = p.read_text(encoding="utf-8")
    new, k = re.subn(r"<!-- learn:start -->.*?<!-- learn:end -->", lambda m: block, t, count=1, flags=re.S)
    if k != 1:
        raise SystemExit(f"{path}: faltan las marcas learn")
    p.write_text(new, encoding="utf-8")


swap("sitemap.xml", "sitemap.txt", "  ")
swap("llms.txt", "llms.txt", "")
print(f"etapa {n} (hoy {today}, inicio {cal.get('inicio')})")
