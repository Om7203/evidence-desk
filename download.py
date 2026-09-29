"""Download the two public NIST source PDFs; keep source attribution in sources.json."""

import hashlib
import json
from pathlib import Path

import requests

ROOT = Path(__file__).parent
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)


def main():
    manifest = []
    for source in json.loads((ROOT / "sources.json").read_text(encoding="utf-8")):
        path = DATA / source["filename"]
        if not path.exists():
            response = requests.get(source["url"], timeout=45)
            response.raise_for_status()
            if not response.content.startswith(b"%PDF-"):
                raise ValueError(f"Expected PDF from {source['url']}")
            path.write_bytes(response.content)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        manifest.append({**source, "bytes": path.stat().st_size, "sha256": digest})
        print(f"{source['id']}: {path.stat().st_size:,} bytes, sha256 {digest[:12]}…")
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
