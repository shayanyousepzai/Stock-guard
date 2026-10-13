"""Measure how well the local model reads recall notices, with and without the verification step.

    python eval/recall_eval.py            # 24 synthetic notices, writes eval/results.md
    python eval/recall_eval.py 8          # quick run
"""
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from stockguard import core, llm  # noqa: E402

N = int(sys.argv[1]) if len(sys.argv) > 1 else 24
rng = random.Random(7)
PRODUCTS = ["Amoxicillin 500mg capsules", "Metformin 500mg tablets", "Omeprazole 20mg capsules", "Salbutamol 100mcg inhaler",
            "Atorvastatin 20mg tablets", "Cetirizine 10mg tablets", "Ibuprofen 400mg tablets", "Azithromycin 250mg tablets"]
REASONS = ["failed dissolution testing", "a faulty dose counter", "possible particle contamination", "incorrect strength printed on the label",
           "a packaging seal defect", "microbial contamination found in testing"]


def batch():
    s = "".join(rng.choices("ABCDEFGHJKLMNPRSTVWXZ", k=3)) + rng.choice(["", "-"]) + str(rng.randint(1000, 9999)) + rng.choice(["", "A", "B", "C"])
    return s


def make(i):
    p, r = rng.choice(PRODUCTS), rng.choice(REASONS)
    ref, ph = f"RC-2026-{rng.randint(100, 999)}", f"0{rng.randint(800, 899)} 555 0{rng.randint(100, 199)}"
    day = f"{rng.randint(1, 28)} Oct 2026"
    k = i % 4
    if k == 3:
        text = f"Product: {p}\nAll batches recalled.\nReason: {r}\nRef: {ref}, phone {ph}\nIssued {day}"
        return text, [], True
    bs = [batch() for _ in range(rng.randint(1, 3))]
    if k == 0:
        text = f"RECALL NOTICE\nProduct: {p}\nBatch numbers: {', '.join(bs)}\nReason: {r}\nRef: {ref}, phone {ph}\nIssued {day}"
    elif k == 1:
        text = (f"Dear pharmacist,\n\nWe are withdrawing {p} lots {' and '.join(bs)} after {r}. Please stop dispensing and quarantine "
                f"stock. Questions: {ph}. Ref {ref}, dated {day}.\n\nRegards, Quality team")
    else:
        text = f"URGENT - {p}\n{r.capitalize()}.\nAffected:\n" + "\n".join(f"- Lot {b}" for b in bs) + f"\nReturn to wholesaler by {day}. Case {ref}. Tel {ph}."
    return text, bs, False


def score(pred, truth, notice=None):
    P, T = {core.norm_batch(b) for b in pred}, {core.norm_batch(b) for b in truth}
    return len(P & T), len(P - T), len(T - P)  # true pos, false pos, false neg


def totals(rows):
    tp, fp, fn = (sum(r[i] for r in rows) for i in range(3))
    return tp / max(tp + fp, 1), tp / max(tp + fn, 1), fp


if __name__ == "__main__":
    model = llm.Ollama()
    rules, raw, ver, flag_ok, code_ok, errors = [], [], [], 0, 0, 0
    t0 = time.time()
    for i in range(N):
        text, truth, all_b = make(i)
        rules.append(score(core.extract_rules(text)["batch_numbers"], truth))
        try:
            rec = model.extract_recall(text)
        except Exception as e:
            errors += 1
            print(i, "model error", e, flush=True)
            continue
        raw.append(score(rec.get("batch_numbers", []), truth))
        checked, _ = core.verify_recall(rec, text)
        ver.append(score(checked["batch_numbers"], truth))
        flag_ok += bool(rec.get("all_batches")) == all_b
        code_ok += core.says_all_batches(text) == all_b
        print(f"{i + 1}/{N} done {time.time() - t0:.0f}s", flush=True)
    n = len(raw)
    lines = [f"# Recall extraction eval ({llm.MODEL}, {N} synthetic notices, {errors} errors)", "",
             "| Method | Precision | Recall | Invented batch numbers |", "| --- | --- | --- | --- |"]
    for name, rows in (("Rules only (regex)", rules), ("Model, raw output", raw), ("Model + verification", ver)):
        p, r, fp = totals(rows)
        lines.append(f"| {name} | {p:.0%} | {r:.0%} | {fp} |")
    lines += ["", f"'All batches' flag: model {flag_ok}/{n} correct, code check {code_ok}/{n} correct (the app uses the code check).", "",
              "Invented = a batch number in the output that is not in the ground truth. Verification keeps only numbers that appear in the notice text."]
    Path(__file__).with_name("results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
