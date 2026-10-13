"""Deterministic engine: parsing, expiry buckets, recall matching, returns, reorder.

Nothing here calls a model. An optional `llm` object may be passed to `analyze`;
every answer it gives is verified against the source text before it is used.
"""
import calendar
import csv
import difflib
import io
import re
from datetime import date

SYNONYMS = {
    "product": ["product name", "product", "item name", "item", "drug", "medicine", "description", "name"],
    "batch": ["batch no", "batch number", "batch", "lot no", "lot number", "lot"],
    "expiry": ["expiry date", "exp date", "expiration date", "expiry", "expiration", "exp", "best before"],
    "qty": ["qty on hand", "quantity", "qty", "on hand", "stock", "units", "balance"],
    "unit_cost": ["unit cost", "cost price", "purchase price", "cost", "price"],
    "supplier": ["supplier", "vendor", "distributor"],
    "reorder_level": ["reorder level", "min stock", "min qty", "par level", "reorder", "minimum"],
}
REQUIRED = ("product", "batch", "expiry", "qty")
FORM_WORDS = {"tablet", "tablets", "tab", "tabs", "capsule", "capsules", "cap", "caps", "syrup", "inhaler", "the", "of", "and", "for"}
RANK = {"recalled": 0, "expired": 1, "critical": 2, "warning": 3, "ok": 4}

_MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_abbr) if m}
_MONTHS.update({m.lower(): i for i, m in enumerate(calendar.month_name) if m})


def norm_header(h):
    return re.sub(r"[^a-z0-9]+", " ", h.lower()).strip()


def norm_batch(b):
    return re.sub(r"[^A-Z0-9]", "", str(b).upper())


def map_headers(headers):
    """Map known header spellings to internal fields. Returns {field: original header}."""
    normed = {h: norm_header(h) for h in headers}
    mapping, used = {}, set()
    for exact in (True, False):
        for field, syns in SYNONYMS.items():
            if field in mapping:
                continue
            for h, n in normed.items():
                if h in used:
                    continue
                if (exact and n in syns) or (not exact and any(len(s) >= 3 and s in n for s in syns)):
                    mapping[field] = h
                    used.add(h)
                    break
    return mapping


def _eom(y, m):
    return date(y, m, calendar.monthrange(y, m)[1])


def parse_date(s, day_first=True):
    """Parse the date spellings pharmacies use. Month-only dates mean the end of that month."""
    s = (s or "").strip().strip(".")
    if not s:
        return None
    try:
        m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})", s)
        if m:
            return date(int(m[1]), int(m[2]), int(m[3]))
        m = re.fullmatch(r"(\d{4})[-/.](\d{1,2})", s)
        if m:
            return _eom(int(m[1]), int(m[2]))
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})", s)
        if m:
            a, b, y = int(m[1]), int(m[2]), int(m[3])
            y += 2000 if y < 100 else 0
            d, mo = (a, b) if day_first else (b, a)
            if mo > 12 >= d:
                d, mo = mo, d
            return date(y, mo, d)
        m = re.fullmatch(r"(\d{1,2})[-/.](\d{2,4})", s)
        if m:
            y = int(m[2]) + (2000 if int(m[2]) < 100 else 0)
            return _eom(y, int(m[1]))
        m = re.fullmatch(r"(\d{1,2})[ -]([A-Za-z]{3,9})[ ,-]*(\d{2,4})", s)
        if m and m[2].lower() in _MONTHS:
            y = int(m[3]) + (2000 if int(m[3]) < 100 else 0)
            return date(y, _MONTHS[m[2].lower()], int(m[1]))
        m = re.fullmatch(r"([A-Za-z]{3,9})[ ,-]*(\d{2,4})", s)
        if m and m[1].lower() in _MONTHS:
            y = int(m[2]) + (2000 if int(m[2]) < 100 else 0)
            return _eom(y, _MONTHS[m[1].lower()])
    except ValueError:
        return None
    return None


def _num(s):
    s = re.sub(r"[^0-9.\-]", "", s or "")
    if s in ("", "-", "."):
        return None
    f = float(s)
    return int(f) if f == int(f) else f


def _tokens(product):
    p = re.sub(r"(\d)\s*(mg|mcg|ml|g|iu)\b", r"\1\2", product.lower())
    return {t for t in re.findall(r"[a-z0-9]+", p) if t not in FORM_WORDS}


def product_match(a, b):
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    strength = lambda t: {x for x in t if re.fullmatch(r"\d+(\.\d+)?(mg|mcg|ml|g|iu)", x)}
    sa, sb = strength(ta), strength(tb)
    if sa and sb and sa != sb:  # 500mg is never 850mg, however similar the names look
        return False
    if ta <= tb or tb <= ta:
        return True
    return difflib.SequenceMatcher(None, " ".join(sorted(ta)), " ".join(sorted(tb))).ratio() >= 0.88


def split_notices(text):
    text = (text or "").strip()
    if not text:
        return []
    parts = re.split(r"^\s*(?:-{3,}|={3,})\s*$", text, flags=re.M)
    if len(parts) == 1:
        parts = re.split(r"\n\s*\n\s*\n", text)
    return [p.strip() for p in parts if p.strip()]


def says_all_batches(notice):
    """Decided by code, not the model: a missed 'all batches' recall is the costliest mistake."""
    return bool(re.search(r"\b(?:all|every|any)\s+(?:batch(?:es)?|lots?)\b", notice, re.I))


def extract_rules(notice):
    """Regex extraction for notices that label their fields. Works with the model off."""
    product = None
    m = re.search(r"^\s*(?:product|medicine|drug)(?: name)?\s*[:\-]\s*(.+)$", notice, re.I | re.M)
    if m:
        product = m[1].strip()
    batches = []
    for m in re.finditer(r"^.*?\b(?:batch(?:es)?|lots?)\b(?:\s*(?:no\.?|numbers?|#))*\s*[:\-]?\s*(.+)$", notice, re.I | re.M):
        for piece in re.split(r"[,;/&]|\band\b", m[1]):
            tok = (piece.split() or [""])[0].strip(" .")
            if 3 <= len(tok) <= 20 and re.search(r"\d", tok):
                batches.append(tok)
        if batches:
            break
    m = re.search(r"reason\s*[:\-]\s*(.+)$", notice, re.I | re.M)
    first = next((ln.strip() for ln in notice.splitlines() if ln.strip()), "")
    return {
        "product": product,
        "batch_numbers": batches,
        "all_batches": says_all_batches(notice),
        "reason": (m[1].strip() if m else first)[:200],
    }


def verify_recall(rec, notice):
    """Keep only batch numbers that literally appear in the notice. Returns (recall, dropped)."""
    haystack = norm_batch(notice)
    kept, dropped = [], []
    for b in rec.get("batch_numbers") or []:
        nb = norm_batch(b)
        (kept if len(nb) >= 3 and nb in haystack else dropped).append(str(b))
    return {**rec, "batch_numbers": kept}, dropped


def _bucket(days, critical, warning):
    if days < 0:
        return "expired"
    if days <= critical:
        return "critical"
    return "warning" if days <= warning else "ok"


def _read_rows(text):
    text = text.lstrip("﻿")
    first = text.splitlines()[0] if text.strip() else ""
    delim = max(",;\t", key=first.count)
    rd = csv.reader(io.StringIO(text), delimiter=delim)
    rows = [r for r in rd if any(c.strip() for c in r)]
    return (rows[0], rows[1:]) if rows else ([], [])


def _email(supplier, items, sym):
    lines = [f"Subject: Return request - {len(items)} batch(es)", "", f"Hello {supplier},", "",
             "Please arrange collection and credit for the following batches:", ""]
    for it in items:
        lines.append(f"- {it['product']} | batch {it['batch']} | qty {it['qty']} | {it['reason']}")
    lines += ["", "Thank you."]
    return "\n".join(lines)


def analyze(stock_csv, recalls_text="", *, today=None, critical=30, warning=90, day_first=True, llm=None, currency=""):
    today = today or date.today()
    notes = []
    headers, body = _read_rows(stock_csv)
    if not headers:
        raise ValueError("The stock file is empty.")
    mapping = map_headers(headers)
    missing = [f for f in REQUIRED if f not in mapping]
    if missing and llm:
        guess = llm.map_headers([h for h in headers if h not in mapping.values()], missing)
        for f, col in guess.items():
            if f in missing and col in headers and col not in mapping.values():
                mapping[f] = col
                notes.append(f"AI matched column '{col}' to {f}; check it looks right.")
        missing = [f for f in REQUIRED if f not in mapping]
    if missing:
        raise ValueError("Could not find columns for: " + ", ".join(missing) + ". Found headers: " + ", ".join(headers))
    idx = {f: headers.index(c) for f, c in mapping.items()}

    def cell(r, f):
        return r[idx[f]].strip() if f in idx and idx[f] < len(r) else ""

    items, bad = [], []
    for n, r in enumerate(body, start=2):
        exp = parse_date(cell(r, "expiry"), day_first)
        qty = _num(cell(r, "qty"))
        if not cell(r, "product") or exp is None or qty is None:
            bad.append({"line": n, "reason": "missing product, unreadable expiry or quantity", "raw": ", ".join(r)[:120]})
            continue
        cost = _num(cell(r, "unit_cost"))
        days = (exp - today).days
        items.append({
            "product": cell(r, "product"), "batch": cell(r, "batch"), "expiry": exp.isoformat(), "days": days,
            "qty": qty, "unit_cost": cost, "value": round(qty * cost, 2) if cost is not None else 0,
            "supplier": cell(r, "supplier") or "Unknown supplier", "level": _num(cell(r, "reorder_level")),
            "status": _bucket(days, critical, warning), "recall": None,
        })

    recalls = []
    for notice in split_notices(recalls_text):
        rec = None
        if llm:
            try:
                rec = llm.extract_recall(notice)
            except Exception as e:  # model off or slow: fall back to rules
                notes.append(f"AI recall reading failed ({type(e).__name__}); used rules instead.")
        rec = rec or extract_rules(notice)
        rec["all_batches"] = says_all_batches(notice)
        rec, dropped = verify_recall(rec, notice)
        if dropped:
            notes.append(f"Dropped batch numbers not found in the notice text: {', '.join(dropped)}.")
        keys = {norm_batch(b) for b in rec["batch_numbers"]}
        hits = 0
        for it in items:
            by_batch = norm_batch(it["batch"]) in keys
            if rec.get("product"):
                ok = product_match(rec["product"], it["product"]) and (rec.get("all_batches") or by_batch)
            else:
                ok = by_batch and len(norm_batch(it["batch"])) >= 4
            if ok:
                it["status"], it["recall"] = "recalled", rec["reason"] or "Recalled"
                hits += 1
        recalls.append({**rec, "matched": hits})

    items.sort(key=lambda i: (RANK[i["status"]], i["days"]))
    stats = {s: {"count": 0, "value": 0} for s in RANK}
    for it in items:
        stats[it["status"]]["count"] += 1
        stats[it["status"]]["value"] = round(stats[it["status"]]["value"] + it["value"], 2)
    at_risk = round(sum(it["value"] for it in items if it["status"] in ("recalled", "expired", "critical")), 2)

    groups = {}
    for it in items:
        if it["status"] in ("recalled", "expired"):
            why = f"Recalled: {it['recall']}" if it["status"] == "recalled" else f"Expired {abs(it['days'])} days ago"
            groups.setdefault(it["supplier"], []).append({**it, "reason": why})
    returns = [{"supplier": s, "items": g, "total": round(sum(i["value"] for i in g), 2), "email": _email(s, g, currency)}
               for s, g in sorted(groups.items())]

    usable, meta = {}, {}
    for it in items:
        key = " ".join(sorted(_tokens(it["product"]))) or it["product"].lower()
        meta.setdefault(key, {"product": it["product"], "level": None, "supplier": it["supplier"]})
        usable[key] = usable.get(key, 0) + (it["qty"] if it["status"] in ("ok", "warning", "critical") else 0)
        if it["level"] is not None:
            meta[key]["level"] = max(it["level"], meta[key]["level"] or 0)
    reorder = [{"product": m["product"], "usable": usable[k], "level": m["level"], "suggest": 2 * m["level"] - usable[k], "supplier": m["supplier"]}
               for k, m in meta.items() if m["level"] is not None and usable[k] < m["level"]]
    reorder.sort(key=lambda r: r["usable"] / (r["level"] or 1))

    attention = sum(stats[s]["count"] for s in ("recalled", "expired", "critical"))
    facts = (f"Check date {today.isoformat()}. {len(items)} batches checked. {stats['recalled']['count']} recalled, "
             f"{stats['expired']['count']} expired, {stats['critical']['count']} expiring within {critical} days, "
             f"{stats['warning']['count']} expiring within {warning} days. Value at risk {currency}{at_risk:.2f}. "
             f"{len(reorder)} products below reorder level.")
    return {
        "today": today.isoformat(), "mapping": mapping, "rows_total": len(items), "bad_rows": bad, "stats": stats,
        "attention": attention, "at_risk": at_risk, "items": items, "recalls": recalls, "returns": returns,
        "reorder": reorder, "facts": facts, "settings": {"critical": critical, "warning": warning}, "notes": notes,
    }
