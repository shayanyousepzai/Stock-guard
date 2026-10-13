"""Local web server (standard library only): python -m stockguard"""
import argparse
import json
import os
import threading
import time
import webbrowser
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import __version__, core, llm
from .sample import make_sample

PAGE = (Path(__file__).parent / "static" / "index.html").read_bytes
MAX_BODY = 5_000_000


def run_analysis(p):
    ai = bool(p.get("ai")) and llm.status()["up"]
    model = llm.Ollama() if ai else None
    t0 = time.time()
    cur = str(p.get("currency", ""))[:3]
    res = core.analyze(
        p.get("stock_csv", ""), p.get("recalls", ""), today=date.today(),
        critical=int(p.get("critical", 30)), warning=int(p.get("warning", 90)),
        day_first=p.get("date_order", "dmy") == "dmy", llm=model, currency=cur)
    summary = None
    if model:
        try:
            for _ in range(2):  # one retry: a summary is kept only if every number in it is in the data
                s = model.summarize(res["facts"])
                if llm.numbers_ok(s, res["facts"]):
                    summary = s
                    break
            else:
                res["notes"].append("AI summary used a number that was not in the data, so it was discarded.")
        except Exception as e:
            res["notes"].append(f"AI summary failed ({type(e).__name__}).")
    res["ai"] = {"used": ai, "model": llm.MODEL if ai else None, "summary": summary, "seconds": round(time.time() - t0, 1),
                 "asked": bool(p.get("ai"))}
    return res


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/":
            self._send(200, PAGE(), "text/html")
        elif self.path == "/api/status":
            self._send(200, {**llm.status(), "version": __version__})
        elif self.path == "/api/sample":
            stock, recalls = make_sample()
            self._send(200, {"stock_csv": stock, "recalls": recalls})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/analyze":
            return self._send(404, {"error": "not found"})
        n = int(self.headers.get("Content-Length", 0))
        if n > MAX_BODY:
            return self._send(413, {"error": "File too large (5 MB max)."})
        try:
            self._send(200, run_analysis(json.loads(self.rfile.read(n))))
        except ValueError as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # keep the server alive, tell the user
            self._send(500, {"error": f"Unexpected error: {e}"})

    def log_message(self, *a):
        pass


def main():
    ap = argparse.ArgumentParser(description="Pharmacy Stock Guard: local expiry, recall and reorder checks.")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8765)))
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to open it on a phone over shop Wi-Fi")
    ap.add_argument("--no-browser", action="store_true")
    a = ap.parse_args()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    url = f"http://{'localhost' if a.host == '127.0.0.1' else a.host}:{a.port}"
    print(f"Pharmacy Stock Guard {__version__} running at {url}  (Ctrl+C to stop)")
    if not a.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
