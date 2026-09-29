"""Export the indexed public passages for the static, browser-only demo."""

import json
import shutil
from pathlib import Path

from engine import INDEX_PATH

ROOT = Path(__file__).parent
OUTPUT = ROOT / "browser" / "corpus.json"


def main():
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    manifest = ROOT / "data" / "manifest.json"
    if manifest.exists():
        shutil.copyfile(manifest, OUTPUT.parent / "source-manifest.json")
    print(f"Exported {len(index['passages'])} passages ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
