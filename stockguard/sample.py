"""Fictional demo data. Dates are relative to today so the demo always has something to flag."""
from datetime import date, timedelta
from pathlib import Path

ROWS = [  # product, batch, days until expiry, qty, cost, supplier, min stock
    ("Amoxicillin 500mg Caps", "AMX2405B", -45, 60, 0.45, "MedLine Distributors", 80),
    ("Amoxicillin 500mg Caps", "AMX2611A", 210, 40, 0.45, "MedLine Distributors", 80),
    ("Paracetamol 500mg Tabs", "PCM2310K", -10, 200, 0.05, "CareWell Supplies", 300),
    ("Paracetamol 500mg Tabs", "PCM2702D", 320, 150, 0.05, "CareWell Supplies", 300),
    ("Metformin 500mg Tabs", "MET2611C", 140, 90, 0.12, "MedLine Distributors", 100),
    ("Metformin 500mg Tabs", "MET2702A", 400, 120, 0.12, "MedLine Distributors", 100),
    ("Omeprazole 20mg Caps", "OMP2508F", 95, 70, 0.22, "Northgate Pharma", 60),
    ("Omeprazole 20mg Caps", "OMP2601G", 250, 50, 0.22, "Northgate Pharma", 60),
    ("Salbutamol Inhaler 100mcg", "SAL-0932", 180, 12, 3.80, "Northgate Pharma", 15),
    ("Salbutamol Inhaler 100mcg", "SAL-0933", 260, 8, 3.80, "Northgate Pharma", 15),
    ("Ibuprofen 400mg Tabs", "IBU2412M", 3, 80, 0.07, "CareWell Supplies", 100),
    ("Cetirizine 10mg Tabs", "CET2501P", 12, 45, 0.09, "CareWell Supplies", 50),
    ("Atorvastatin 20mg Tabs", "ATV2509R", 25, 30, 0.31, "MedLine Distributors", 40),
    ("Loratadine 10mg Tabs", "LOR2507T", 40, 55, 0.08, "CareWell Supplies", 40),
    ("Azithromycin 250mg Tabs", "AZI2509V", 70, 24, 0.95, "Northgate Pharma", 20),
    ("Amlodipine 5mg Tabs", "AML2603W", 120, 100, 0.10, "MedLine Distributors", 60),
    ("Vitamin D3 1000IU Caps", "VTD2701X", 300, 90, 0.06, "CareWell Supplies", 50),
    ("Oral Rehydration Salts", "ORS2504Z", -90, 36, 0.30, "CareWell Supplies", 30),
    ("Ciprofloxacin 500mg Tabs", "CIP2606H", 200, 6, 0.55, "Northgate Pharma", 20),
    ("Diclofenac Gel 1%", "DIC2602J", 160, 14, 2.40, "MedLine Distributors", 10),
]


def make_sample(today=None):
    today = today or date.today()
    out = ["Item Name,Batch No.,Exp. Date,Qty On Hand,Cost Price,Supplier,Min Stock"]
    for i, (p, b, off, q, c, s, m) in enumerate(ROWS):
        d = today + timedelta(days=off)
        shown = d.strftime("%d/%m/%Y") if i % 3 else d.strftime("%b %Y") if off > 60 else d.strftime("%d-%m-%Y")
        out.append(f"{p},{b},{shown},{q},{c},{s},{m}")
    recalls = (
        "SAMPLE NOTICE (fictional)\nProduct: Metformin 500mg tablets\nBatch numbers: MET2611C, MET2999Z\n"
        "Reason: Failed dissolution test\nRef: RC-2026-114, call 0800 555 0199\n"
        "\n---\n"
        "Dear pharmacist, the maker of Salbutamol 100mcg inhalers is withdrawing lots SAL0932 and SAL0933 "
        "after reports of a faulty dose counter. Please quarantine them. Ref RC-2026-121, issued 3 Oct 2026.\n"
        "\n---\n"
        "Product: Omeprazole 20mg capsules\nAll batches recalled.\nReason: Packaging contamination risk\nRef: RC-2026-130\n"
    )
    return "\n".join(out) + "\n", recalls


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent / "sample"
    root.mkdir(exist_ok=True)
    stock, recalls = make_sample()
    (root / "stock.csv").write_text(stock, encoding="utf-8")
    (root / "recalls.txt").write_text(recalls, encoding="utf-8")
    print("wrote", root)
