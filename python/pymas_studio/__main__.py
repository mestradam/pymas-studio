"""``python -m pymas_studio model.json`` command-line entry point."""

from __future__ import annotations

import argparse

from .server import show


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Abre un modelo pymas en el visor 3D estático."
    )
    parser.add_argument("model", help="Ruta al archivo JSON exportado por pymas")
    parser.add_argument("--port", type=int, default=0, help="Puerto local (0 = libre)")
    parser.add_argument(
        "--no-browser", action="store_true", help="No abrir el navegador automáticamente"
    )
    args = parser.parse_args()

    url = show(
        args.model,
        port=args.port,
        open_browser=not args.no_browser,
        block=True,
    )
    print(f"PyMAS Studio disponible en {url}")


if __name__ == "__main__":
    main()
