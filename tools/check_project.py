"""Static checks for the portal and the three isolated frontend copies."""

from html.parser import HTMLParser
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SYSTEMS = ("gcobarf", "cocteleria", "cafeteria")
FORBIDDEN = ("izvcbkwgtciuoampunba", "AKfycbz0kMO6luyS5k", "la_licorera_17")


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("href", "src") and value:
                self.urls.append(value)


errors = []
for html in (ROOT / "index.html", *ROOT.glob("negocios/*/*.html")):
    parser = Assets()
    parser.feed(html.read_text(encoding="utf-8"))
    for url in parser.urls:
        if url.startswith(("https://", "http://", "#", "data:")):
            continue
        target = (html.parent / url.split("?", 1)[0]).resolve()
        if url == "admin/":
            continue  # Vite serves this route; npm run build generates dist/admin/index.html.
        if not target.is_file():
            errors.append(f"Falta recurso: {html.relative_to(ROOT)} → {url}")

portal = (ROOT / "index.html").read_text(encoding="utf-8")
for system in SYSTEMS:
    folder = ROOT / "negocios" / system
    if f"negocios/{system}/admin.html" not in portal:
        errors.append(f"Falta enlace de {system} en el portal")
    app = (folder / "app.js").read_text(encoding="utf-8")
    config = (folder / "config.js").read_text(encoding="utf-8")
    for key in FORBIDDEN:
        if key in app or key in config:
            errors.append(f"Referencia anterior en {system}: {key}")
    if f"tc_{system}_admin_token" not in app:
        errors.append(f"La sesión local de {system} no está aislada")
    if 'new URL("cliente.html"' not in app:
        errors.append(f"Los QR de {system} no apuntan a cliente.html")
    if not re.search(r'url:\s*"TU_SUPABASE_URL"', config):
        errors.append(f"{system} no tiene URL pendiente de configuración")

if errors:
    raise SystemExit("\n".join(errors))
print("Portal, recursos, rutas de QR y aislamiento local: OK")
