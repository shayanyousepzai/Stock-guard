# Stock Guard

**Catch the money before it expires.** Stock Guard reads a pharmacy's stock export and the recall notices it has received, then tells the owner what is expired, what is recalled, what to send back to each supplier, and what to reorder. It runs entirely on the pharmacy's own PC with a small open model through [Ollama](https://ollama.com). No stock data is uploaded anywhere.

Built for the Hacktoberfest 2026 "Side Hustle" challenge: open-source AI that someone would actually pay for.

## Why a pharmacy would pay

- Expired stock is written off at full cost, and most independent shops still check it by eye.
- A missed recall is a regulatory and reputational risk.
- Stock and supplier data is commercially sensitive, so "it never leaves this PC" is the feature.

## How it works

```
stock CSV ──► load + map columns ──► rules engine (expiry, value, reorder) ──┐
                     ▲ (AI only for unknown headers)                         ├──► report, returns, emails
recall notices ──► read recall (model) ──► verify ──► exact batch match ────┘
```

**The model reads and writes text. Code makes every decision.**

| Step | Who does it | Guardrail |
| --- | --- | --- |
| Map columns (`Lot`, `Exp. Date`…) | Lookup table first, model only for leftovers | Model answer must name a real column |
| Parse dates (`03/2027`, `Mar 2027`, `05/03/2027`) | Code | Unreadable rows are listed, never guessed |
| Expiry buckets, value at risk, reorder | Code | Thresholds are settings |
| Read a recall notice into product, batches, reason | Model (regex fallback when AI is off) | A batch number is kept only if it appears in the notice text; the "all batches" flag is decided by code (the 3B model got it right on 18/24 notices, the code check on 24/24) |
| Match recalled batches to your shelf | Code | Exact batch match; strengths must agree (500mg is never 850mg) |
| Weekly briefing | Model | Discarded if it uses any number not in the computed data |

See [eval/results.md](eval/results.md) for measured accuracy of the recall reader.

## Run it

Needs Python 3.10+ and, for AI features, Ollama with a small model. There are no Python dependencies.

```bash
ollama pull llama3.2
python -m stockguard            # opens http://localhost:8765
```

Press **Try a sample shelf** to see it work on fictional data, or drop in a CSV export from your billing system. Columns it understands: product, batch/lot, expiry, quantity (required) and unit cost, supplier, minimum stock (optional). Names are matched flexibly.

To open it on a phone over shop Wi-Fi: `python -m stockguard --host 0.0.0.0`.

Useful settings: `STOCKGUARD_MODEL=qwen2.5:3b` to switch model, `OLLAMA_HOST` for a remote Ollama.

Tested on an Intel i5-6300U with 8 GB RAM and no GPU using `llama3.2` (3B). With the AI switched off the check takes about two seconds.

## Tests

```bash
python -m unittest discover -s tests
python eval/recall_eval.py        # regenerates eval/results.md (needs Ollama, ~10 min on CPU)
```

## Demo video

The 36-second demo is rendered from code with headless Chrome and WebCodecs: real app captures, motion graphics and a synthesised soundtrack. It needs Node 22+ and Chrome, and no other packages.

```bash
python -m stockguard --no-browser          # keep running in another terminal
node video/capture.mjs                     # HD captures of the running app
node video/render.mjs                      # writes video/out/stock-guard-demo.webm
```

## Limits

- CSV only for now (save Excel files as CSV).
- Recall notices are pasted text; PDF and email import are not built yet.
- It flags stock. It gives no dosing, substitution or clinical advice and is not a substitute for the pharmacist's own recall process.
- The model is small. That is why every model answer is checked before it is used.

## Hosted demo

`render.yaml` deploys the app to Render's free tier with the AI switched off (a 3B model does not fit in 512 MB). Everything except the model-written briefing and AI notice reading works there.

## Licence

MIT
