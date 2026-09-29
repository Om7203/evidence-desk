"""Small human-labeled retrieval and abstention check; does not score generated answers."""

import json
from pathlib import Path

from engine import Retriever

ROOT = Path(__file__).parent


def run():
    retriever = Retriever.from_disk()
    cases = json.loads((ROOT / "evals" / "cases.json").read_text(encoding="utf-8"))
    details = []
    for case in cases:
        response = retriever.ask(case["question"])
        sources = response["sources"]
        matches = [item for item in sources if item["source_id"] == case["source_id"] and item["page"] in case["pages"]]
        expected_abstain = case["source_id"] is None
        details.append({
            "question": case["question"],
            "expected": "abstain" if expected_abstain else f"{case['source_id']} PDF p. {case['pages']}",
            "actual": "abstain" if not sources else f"{sources[0]['source_id']} PDF p. {sources[0]['page']}",
            "top1_hit": not sources if expected_abstain else bool(matches and matches[0] == sources[0]),
            "top3_hit": not sources if expected_abstain else bool(matches[:1] and matches[0] in sources[:3]),
        })
    positives = [item for item, case in zip(details, cases) if case["source_id"]]
    negatives = [item for item, case in zip(details, cases) if not case["source_id"]]
    report = {
        "method": "extractive-retrieval-v1",
        "dataset": "11 hand-labeled questions over two NIST PDFs (9 in-scope, 2 out-of-scope)",
        "limitations": "Pages were selected by manual inspection. Small, non-blinded set; no answer correctness or generalization claim.",
        "retrieval_top1": f"{sum(x['top1_hit'] for x in positives)}/{len(positives)}",
        "retrieval_top3": f"{sum(x['top3_hit'] for x in positives)}/{len(positives)}",
        "out_of_scope_abstain": f"{sum(x['top1_hit'] for x in negatives)}/{len(negatives)}",
        "cases": details,
    }
    target = ROOT / "docs" / "evaluation.json"
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Top-1 cited page: {report['retrieval_top1']}")
    print(f"Top-3 cited page: {report['retrieval_top3']}")
    print(f"Out-of-scope abstentions: {report['out_of_scope_abstain']}")
    for item in details:
        if not item["top1_hit"]:
            print(f"MISS {item['question']} -> {item['actual']} (expected {item['expected']})")


if __name__ == "__main__":
    run()
