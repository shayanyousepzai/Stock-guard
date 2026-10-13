import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from stockguard import core, llm  # noqa: E402
from stockguard.sample import make_sample  # noqa: E402

TODAY = date(2026, 10, 14)


class Dates(unittest.TestCase):
    def test_formats(self):
        self.assertEqual(core.parse_date("2027-03-05"), date(2027, 3, 5))
        self.assertEqual(core.parse_date("05/03/2027"), date(2027, 3, 5))
        self.assertEqual(core.parse_date("05/03/2027", day_first=False), date(2027, 5, 3))
        self.assertEqual(core.parse_date("03/2027"), date(2027, 3, 31))
        self.assertEqual(core.parse_date("Feb 2028"), date(2028, 2, 29))
        self.assertEqual(core.parse_date("12 Mar 2027"), date(2027, 3, 12))
        self.assertEqual(core.parse_date("25/12/2026", day_first=False), date(2026, 12, 25))

    def test_bad(self):
        self.assertIsNone(core.parse_date("soon"))
        self.assertIsNone(core.parse_date("31/02/2027"))


class Headers(unittest.TestCase):
    def test_map(self):
        m = core.map_headers(["Item Name", "Lot", "Expiration Date", "Quantity", "Vendor"])
        self.assertEqual(m, {"product": "Item Name", "batch": "Lot", "expiry": "Expiration Date", "qty": "Quantity", "supplier": "Vendor"})


class Recalls(unittest.TestCase):
    def test_verify_drops_invented_batches(self):
        notice = "Recall of lots SAL0932 and SAL0933."
        rec, dropped = core.verify_recall({"batch_numbers": ["SAL-0932", "XYZ9999"]}, notice)
        self.assertEqual(rec["batch_numbers"], ["SAL-0932"])
        self.assertEqual(dropped, ["XYZ9999"])

    def test_rules_extraction(self):
        r = core.extract_rules("Product: Metformin 500mg\nBatch numbers: A123, B456 and C789\nReason: bad tablets")
        self.assertEqual(r["batch_numbers"], ["A123", "B456", "C789"])
        self.assertEqual(r["product"], "Metformin 500mg")

    def test_product_match(self):
        self.assertTrue(core.product_match("Metformin 500mg tablets", "Metformin 500 mg Tabs"))
        self.assertFalse(core.product_match("Metformin 500mg", "Metformin 850mg"))


class EndToEnd(unittest.TestCase):
    def setUp(self):
        stock, recalls = make_sample(TODAY)
        self.res = core.analyze(stock, recalls, today=TODAY)
        self.by = {i["batch"]: i for i in self.res["items"]}

    def test_buckets(self):
        self.assertEqual(self.by["AMX2405B"]["status"], "expired")
        self.assertEqual(self.by["IBU2412M"]["status"], "critical")
        self.assertEqual(self.by["ATV2509R"]["status"], "critical")
        self.assertEqual(self.by["LOR2507T"]["status"], "warning")
        self.assertEqual(self.by["PCM2702D"]["status"], "ok")

    def test_recalls_matched(self):
        self.assertEqual(self.by["MET2611C"]["status"], "recalled")
        self.assertEqual(self.by["MET2702A"]["status"], "ok")
        self.assertEqual(self.by["SAL-0932"]["status"], "recalled")
        self.assertEqual(self.by["SAL-0933"]["status"], "recalled")
        self.assertEqual({self.by[b]["status"] for b in ("OMP2508F", "OMP2601G")}, {"recalled"})

    def test_invented_batch_not_matched(self):
        self.assertEqual(self.res["recalls"][0]["matched"], 1)  # MET2999Z is not in stock

    def test_returns_and_reorder(self):
        sup = {g["supplier"] for g in self.res["returns"]}
        self.assertEqual(sup, {"MedLine Distributors", "CareWell Supplies", "Northgate Pharma"})
        names = {r["product"] for r in self.res["reorder"]}
        self.assertIn("Omeprazole 20mg Caps", names)  # all batches recalled, usable stock is 0

    def test_bad_rows(self):
        res = core.analyze("Product,Batch,Expiry,Qty\nFoo,A1,never,5\nBar,B2,2027-01-01,3\n", today=TODAY)
        self.assertEqual(res["rows_total"], 1)
        self.assertEqual(len(res["bad_rows"]), 1)


class Summary(unittest.TestCase):
    def test_numbers_guard(self):
        facts = "3 expired. Value at risk $120.50."
        self.assertTrue(llm.numbers_ok("You have 3 expired items worth $120.50.", facts))
        self.assertFalse(llm.numbers_ok("You have 4 expired items.", facts))


if __name__ == "__main__":
    unittest.main()
