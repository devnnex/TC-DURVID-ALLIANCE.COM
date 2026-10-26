"""Create isolated frontend copies from the Tienda Nápoles reference.

Run once from this folder with: python tools/prepare_clones.py
Existing copies are intentionally never overwritten.
"""

from pathlib import Path
import json
import shutil


PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT.parent / "TIENDA-NAPOLES-BCA.COM-main"
SYSTEMS = {
    "gcobarf": ("GCOBARF Nutripet's", "#2662ec", "GN"),
    "cocteleria": ("Jespresso Olivia Coctelería", "#c99a50", "JO"),
    "cafeteria": ("Jespresso Olivia Cafetería", "#a66b39", "JC"),
}


def write_new(path: Path, content: str) -> None:
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def clone_system(slug: str, name: str, color: str, initials: str) -> None:
    destination = PROJECT / "negocios" / slug
    destination.mkdir(parents=True, exist_ok=True)
    for directory in ("images", "sound"):
        (destination / directory).mkdir(exist_ok=True)
        for source_file in (SOURCE / directory).iterdir():
            if source_file.name == "tienda-napoles-login.png":
                continue
            target = destination / directory / source_file.name
            if not target.exists():
                shutil.copy2(source_file, target)
    stylesheet = (SOURCE / "style.css").read_text(encoding="utf-8").replace(
            '#050505 url("images/tienda-napoles-login.png") center / min(92vw, 920px) auto no-repeat',
            '#050505'
    )
    write_new(destination / "style.css", stylesheet)
    worker = (SOURCE / "service-worker.js").read_text(encoding="utf-8")
    worker = worker.replace("tienda-napoles-pwa-brand-v1", f"tc-{slug}-pwa-brand-v1")
    write_new(destination / "service-worker.js", worker)

    app = (SOURCE / "app.js").read_text(encoding="utf-8")
    config_start = app.index("const SUPABASE_CONFIG = {")
    config_end = app.index("const APPS_SCRIPT_TIMEOUT_MS", config_start)
    app = app[:config_start] + (
        "const SYSTEM_CONFIG = window.TC_SYSTEM_CONFIG || {};\n"
        "const SUPABASE_CONFIG = SYSTEM_CONFIG.supabase || { url: '', anonKey: '' };\n"
        "const APPS_SCRIPT_CONFIG = { webAppUrl: SYSTEM_CONFIG.appsScriptUrl || '' };\n"
    ) + app[config_end:]
    app = app.replace("tienda_napoles_", f"tc_{slug}_")
    app = app.replace("tienda-napoles-pwa-brand-v1", f"tc-{slug}-pwa-brand-v1")
    app = app.replace("la_licorera_17_", f"tc_{slug}_")
    app = app.replace("waiter_alarm_enabled", f"tc_{slug}_waiter_alarm_enabled")
    app = app.replace("receipt_sound_", f"tc_{slug}_receipt_sound_")
    app = app.replace('new URL("index.html",', 'new URL("cliente.html",')
    app = app.replace('"Tienda Nápoles"', f'"{name}"')
    app = app.replace("Tu acceso a Tienda Nápoles", f"Tu acceso a {name}")
    app = app.replace('      toast("Configura SUPABASE_CONFIG y verifica que cargue supabase-js.", "error");\n', '')
    setup_start = app.rindex('    if (!connect()) {')
    setup_end = app.index('    if (state.page === "client") {', setup_start)
    app = app[:setup_start] + '''    if (!connect()) {
      const errorBox = document.querySelector("#loginError");
      if (errorBox) {
        errorBox.textContent = "Pendiente de conectar este negocio: configura su Supabase en config.js.";
        const submit = document.querySelector("#loginForm [type='submit']");
        if (submit) submit.disabled = true;
      } else {
        document.body.innerHTML = `<main class="setup-screen"><div class="setup-card">
          <h1>Conecta Supabase</h1><p>Configura config.js y ejecuta los SQL numerados de la carpeta supabase.</p>
        </div></main>`;
      }
      refreshIcons();
      return;
    }
''' + app[setup_end:]
    write_new(destination / "app.js", app)

    for source_name, target_name, page in (
        ("admin.html", "admin.html", "admin"),
        ("index.html", "cliente.html", "client"),
    ):
        html = (SOURCE / source_name).read_text(encoding="utf-8")
        html = html.replace(f'<body data-page="{page}">', f'<body data-page="{page}" data-system="{slug}">')
        html = html.replace('document.write(`<link rel="stylesheet" href="style.css?v=${window.__APP_ASSET_VERSION__}">`);',
                            'document.write(`<link rel="stylesheet" href="style.css?v=${window.__APP_ASSET_VERSION__}">`);')
        html = html.replace('</head>', '  <link rel="stylesheet" href="../../brand.css">\n  <script src="config.js"></script>\n  </head>')
        html = html.replace('href="index.html"', 'href="cliente.html"')
        html = html.replace('src="images/tienda-napoles-login.png" alt="Tienda Nápoles La Catedral"',
                            f'src="pwa-icon.svg" alt="{name}"')
        html = html.replace('src="images/tienda-napoles-login.png" alt="Tienda NÃ¡poles La Catedral"',
                            f'src="pwa-icon.svg" alt="{name}"')
        if page == "admin":
            html = html.replace('<form class="admin-login-card" id="loginForm">',
                                '<form class="admin-login-card" id="loginForm">\n'
                                '        <a class="login-back" href="../../index.html">← Volver a negocios</a>\n'
                                f'        <div class="system-login-name">{name}</div>')
            html = html.replace('Admin - Servicio a la mesa', f'Acceso · {name}')
            html = html.replace('Iniciar sesion', 'Iniciar sesión')
            html = html.replace('  <body', '  <body')
        else:
            html = html.replace('<title>Servicio a la mesa</title>', f'<title>{name} · Mesa</title>')
        write_new(destination / target_name, html)

    manifest = json.loads((SOURCE / "manifest.webmanifest").read_text(encoding="utf-8"))
    manifest.update(name=name, short_name=name.split()[0], description=f"Operación de {name}",
                    theme_color=color, start_url="./admin.html", id="./admin.html")
    write_new(destination / "manifest.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    icon = (SOURCE / "pwa-icon.svg").read_text(encoding="utf-8")
    icon = icon.replace("#f05a28", color).replace("TN</text>", f"{initials}</text>")
    icon = icon.replace("Tienda NÃ¡poles", name).replace("Tienda Nápoles", name)
    write_new(destination / "pwa-icon.svg", icon)
    config = (
        "// Configura este sistema con su proyecto Supabase independiente.\n"
        "// La anon key es pública; nunca pongas aquí la service_role key.\n"
        "window.TC_SYSTEM_CONFIG = {\n"
        f"  system: \"{slug}\",\n"
        f"  businessName: \"{name}\",\n"
        "  supabase: {\n"
        "    url: \"TU_SUPABASE_URL\",\n"
        "    anonKey: \"TU_SUPABASE_ANON_KEY\"\n"
        "  },\n"
        "  appsScriptUrl: \"\"\n"
        "};\n"
    )
    write_new(destination / "config.js", config)


if __name__ == "__main__":
    for slug, details in SYSTEMS.items():
        clone_system(slug, *details)
    print("Tres copias frontend aisladas creadas. La referencia quedó intacta.")
