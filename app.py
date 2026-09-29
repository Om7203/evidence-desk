"""Local read-only API and demo for the public-document retrieval experiment."""

from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from engine import MAX_QUESTION, Retriever

ROOT = Path(__file__).parent
app = FastAPI(title="Evidence Desk", version="0.1.0")


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=MAX_QUESTION)


@lru_cache(maxsize=1)
def retriever() -> Retriever:
    return Retriever.from_disk()


@app.get("/")
def home():
    return FileResponse(ROOT / "web" / "index.html")


@app.get("/styles.css")
def styles():
    return FileResponse(ROOT / "web" / "styles.css", media_type="text/css")


@app.get("/app.js")
def javascript():
    return FileResponse(ROOT / "web" / "app.js", media_type="text/javascript")


@app.get("/health")
def health():
    try:
        count = len(retriever().passages)
    except (FileNotFoundError, ValueError):
        raise HTTPException(status_code=503, detail="Index unavailable") from None
    return {"status": "ok", "passages": count, "documents": 2}


@app.post("/api/ask")
def ask(payload: Question):
    try:
        return retriever().ask(payload.question)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Index unavailable") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
