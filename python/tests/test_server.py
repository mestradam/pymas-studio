"""Pruebas del puente Python usando sólo la librería estándar."""

from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))

from pymas_studio.server import (  # noqa: E402
    _make_handler,
    _model_to_text,
)


class ModelSerializationTests(unittest.TestCase):
    def test_accepts_fixture_path(self) -> None:
        path = REPO_ROOT / "fixtures" / "space_frame.json"
        payload = json.loads(_model_to_text(path))
        self.assertIn("joints", payload)
        self.assertIn("frames", payload)

    def test_accepts_dict(self) -> None:
        model = {"type": "space_frame", "joints": {}, "frames": {}}
        self.assertEqual(json.loads(_model_to_text(model)), model)

    def test_accepts_object_with_to_dict(self) -> None:
        class FakeModel:
            def to_dict(self) -> dict:
                return {"type": "space_frame", "name": "fake"}

        self.assertEqual(_model_to_text(FakeModel()), '{"type": "space_frame", "name": "fake"}')

    def test_accepts_object_with_export_json(self) -> None:
        class FakeModel:
            def export_json(self) -> str:
                return json.dumps({"type": "space_frame", "name": "exported"})

        self.assertIn("exported", _model_to_text(FakeModel()))

    def test_rejects_missing_path(self) -> None:
        with self.assertRaises(FileNotFoundError):
            _model_to_text("/ruta/que/no/existe/modelo.json")

    def test_rejects_unknown_object(self) -> None:
        with self.assertRaises(TypeError):
            _model_to_text(object())


class StaticServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        static = Path(self.temp.name)
        (static / "index.html").write_text("<html><body>studio</body></html>", encoding="utf-8")
        (static / "assets").mkdir()
        (static / "assets" / "app.js").write_text("console.log('ok')", encoding="utf-8")

        self.model_text = json.dumps({"type": "space_frame", "name": "served"})
        handler = _make_handler(static, self.model_text)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.server.daemon_threads = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temp.cleanup()

    def get(self, path: str) -> bytes:
        with urllib.request.urlopen(f"{self.base}{path}", timeout=5) as response:
            return response.read()

    def test_serves_model_on_all_aliases(self) -> None:
        for path in ("/model.json", "/samples/model.json", "/api/model.json"):
            with self.subTest(path=path):
                self.assertEqual(json.loads(self.get(path)), json.loads(self.model_text))

    def test_serves_index_and_assets(self) -> None:
        self.assertIn(b"studio", self.get("/"))
        self.assertIn(b"console.log", self.get("/assets/app.js"))

    def test_spa_fallback_for_extensionless_routes(self) -> None:
        self.assertIn(b"studio", self.get("/deep/route"))


if __name__ == "__main__":
    unittest.main()
