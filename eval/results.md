# Recall extraction eval (llama3.2, 24 synthetic notices, 0 errors)

| Method | Precision | Recall | Invented batch numbers |
| --- | --- | --- | --- |
| Rules only (regex) | 100% | 91% | 0 |
| Model, raw output | 100% | 100% | 0 |
| Model + verification | 100% | 100% | 0 |

'All batches' flag: model 18/24 correct, code check 24/24 correct (the app uses the code check).

Invented = a batch number in the output that is not in the ground truth. Verification keeps only numbers that appear in the notice text.
