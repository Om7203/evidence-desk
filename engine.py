"""Page-aware PDF indexing and a reproducible retrieval baseline."""

import json
import re
from pathlib import Path

import pdfplumber
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).parent
INDEX_PATH = ROOT / "data" / "index.json"
SOURCES_PATH = ROOT / "sources.json"
MAX_QUESTION = 500
QUERY_FILLER = {"what", "which", "how", "does", "do", "the", "a", "an", "is", "are", "in", "of", "to", "about", "say", "says", "according", "document", "documents", "profile", "nist"}


def clean(text: str) -> str:
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)
    return re.sub(r"\s+", " ", text).strip()


def split_page(text: str, target: int = 950, overlap: int = 140) -> list[str]:
    """Split at word boundaries while preserving page-level citation metadata."""
    words = clean(text).split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = start
        length = 0
        while end < len(words) and length < target:
            length += len(words[end]) + 1
            end += 1
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        back = end
        size = 0
        while back > start and size < overlap:
            back -= 1
            size += len(words[back]) + 1
        start = max(start + 1, back)
    return chunks


def build_index() -> dict:
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    passages = []
    for source in sources:
        pdf_path = ROOT / "data" / source["filename"]
        if not pdf_path.exists():
            raise FileNotFoundError(f"Missing {pdf_path}. Run `python download.py` first.")
        with pdfplumber.open(pdf_path) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                for part, text in enumerate(split_page(page.extract_text(x_tolerance=1.5) or ""), start=1):
                    passages.append({
                        "id": f"{source['id']}-p{page_number}-c{part}",
                        "source_id": source["id"],
                        "title": source["title"],
                        "url": source["url"],
                        "page": page_number,
                        "text": text,
                    })
        print(f"Indexed {source['title']}: {len(pdf.pages)} PDF pages")
    if not passages:
        raise ValueError("No text extracted. Scanned PDFs need OCR before indexing.")
    index = {"version": 1, "passages": passages}
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(passages)} passages to {INDEX_PATH}")
    return index


class Retriever:
    def __init__(self, passages: list[dict]):
        if not passages:
            raise ValueError("Index has no passages")
        self.passages = passages
        texts = [p["text"] for p in passages]
        self.word = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english", max_features=75000)
        self.char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True, max_features=75000)
        self.word_matrix = self.word.fit_transform(texts)
        self.char_matrix = self.char.fit_transform(texts)

    @classmethod
    def from_disk(cls):
        if not INDEX_PATH.exists():
            raise FileNotFoundError("Missing search index. Run `python engine.py` first.")
        return cls(json.loads(INDEX_PATH.read_text(encoding="utf-8"))["passages"])

    def search(self, question: str, limit: int = 5) -> list[dict]:
        question = question.strip()
        if not question or len(question) > MAX_QUESTION:
            raise ValueError(f"Question must be 1–{MAX_QUESTION} characters")
        keywords = " ".join(t for t in re.findall(r"[\w-]+", question.lower()) if t not in QUERY_FILLER)
        search_text = keywords or question
        word_score = cosine_similarity(self.word.transform([search_text]), self.word_matrix).ravel()
        char_score = cosine_similarity(self.char.transform([search_text]), self.char_matrix).ravel()
        scores = 0.7 * word_score + 0.3 * char_score
        ranking = scores.argsort()[::-1]
        results = []
        seen_pages = set()
        for idx in ranking:
            passage = self.passages[int(idx)]
            page_key = (passage["source_id"], passage["page"])
            if page_key in seen_pages or scores[idx] < 0.055:
                continue
            seen_pages.add(page_key)
            results.append({**passage, "score": round(float(scores[idx]), 4)})
            if len(results) == limit:
                break
        return results

    def ask(self, question: str) -> dict:
        results = self.search(question)
        if not results or results[0]["score"] < 0.11:
            return {
                "status": "no_evidence",
                "answer": "I could not find sufficiently relevant evidence in these two documents. Try a more specific question or check the source PDFs.",
                "sources": [],
                "method": "extractive-retrieval-v1",
            }
        top = results[0]
        return {
            "status": "evidence_found",
            "answer": f"The most relevant passage I found is in {top['title']}, PDF page {top['page']}. Read the cited passage below to verify it; this version does not generate a new explanation.",
            "sources": results,
            "method": "extractive-retrieval-v1",
        }


if __name__ == "__main__":
    build_index()
