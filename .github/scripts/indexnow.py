"""Avisa a IndexNow (Bing y otros buscadores) de las URLs nuevas o cambiadas. Sin dependencias.
Uso: python3 indexnow.py URL [URL ...]   (o las URLs por la entrada estándar, una por línea)   --dry para solo mostrar.
La clave es el nombre del archivo <32 hex>.txt de la raíz del sitio (el archivo contiene la misma clave)."""
import glob, json, re, sys, urllib.request

HOST = "marketingmedido.com"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
urls = args or [l.strip() for l in sys.stdin if l.strip()]
keys = [re.sub(r"\.txt$", "", f) for f in glob.glob("[0-9a-f]" * 32 + ".txt")]
if not urls or len(keys) != 1:
    print("nada que avisar" if not urls else "falta la clave en la raíz")
    sys.exit(0)
body = {"host": HOST, "key": keys[0], "keyLocation": f"https://{HOST}/{keys[0]}.txt", "urlList": urls[:10000]}
if "--dry" in sys.argv:
    print(json.dumps(body, indent=1)); sys.exit(0)
req = urllib.request.Request("https://api.indexnow.org/indexnow", data=json.dumps(body).encode(), headers={"Content-Type": "application/json; charset=utf-8"})
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("IndexNow", r.status, len(urls), "URLs")
except Exception as e:
    print("IndexNow no respondió:", e)   # no frena la tarea
