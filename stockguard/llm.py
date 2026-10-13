"""Thin Ollama client. The model reads and writes text; core.py checks what it says."""
import json
import os
import re
import urllib.request

HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
if not HOST.startswith("http"):
    HOST = "http://" + HOST
MODEL = os.environ.get("STOCKGUARD_MODEL", "llama3.2")

RECALL_SCHEMA = {
    "type": "object",
    "properties": {
        "product": {"type": "string"},
        "batch_numbers": {"type": "array", "items": {"type": "string"}},
        "all_batches": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["product", "batch_numbers", "all_batches", "reason"],
}


def _post(path, payload, timeout=300):
    req = urllib.request.Request(HOST + path, json.dumps(payload).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def status():
    try:
        with urllib.request.urlopen(HOST + "/api/tags", timeout=2) as r:
            names = [m["name"] for m in json.load(r).get("models", [])]
        return {"up": True, "model": MODEL, "has_model": any(n.startswith(MODEL) for n in names), "models": names}
    except Exception:
        return {"up": False, "model": MODEL, "has_model": False, "models": []}


def chat(system, user, schema=None, num_predict=300):
    body = {"model": MODEL, "stream": False, "keep_alive": "10m",
            "options": {"temperature": 0, "num_predict": num_predict},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
    if schema:
        body["format"] = schema
    return _post("/api/chat", body)["message"]["content"]


class Ollama:
    def map_headers(self, headers, missing):
        schema = {"type": "object", "properties": {f: {"type": "string"} for f in missing}}
        out = chat("You match spreadsheet column names to fields. Answer with JSON. Use only column names from the list, or an empty string.",
                   f"Columns: {headers}\nFields to find: {missing}\n(product = medicine name, batch = batch/lot number, "
                   "expiry = expiry date, qty = quantity on hand)", schema, 120)
        return {k: v for k, v in json.loads(out).items() if v}

    def extract_recall(self, notice):
        out = chat("You read pharmacy recall notices and return JSON. Copy batch numbers exactly as written. "
                   "Ignore reference numbers, phone numbers and dates. If the notice recalls every batch, set all_batches to true.",
                   notice[:3000], RECALL_SCHEMA, 250)
        return json.loads(out)

    def summarize(self, facts):
        return chat("You write a calm 2-3 sentence stock briefing for a pharmacy owner. Use only the numbers given. "
                    "No medical advice. No lists.", facts, None, 120).strip()


def numbers_ok(text, facts):
    """A summary is only used if every number in it appears in the facts it was given."""
    allowed = set(re.findall(r"\d[\d.,]*\d|\d", facts))
    return all(n.rstrip(".,") in allowed for n in re.findall(r"\d[\d.,]*\d|\d", text))
