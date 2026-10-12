"""Local-first FastAPI service for R-Instat Knowledge."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

from memory import get_memory
from gemini import stream_answer

app = FastAPI(title="R-instat Knowlegde API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    limit: int = Field(default=12, ge=1, le=40)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=12000)
    context: list[dict] = Field(default_factory=list)
    mode: Literal["research", "generate", "judge"] = "research"


@app.get("/health")
def health():
    memory = get_memory()
    status = memory.status()
    return {
        "status": "ok",
        "memory": "ready" if status["memory_exists"] else "missing",
        "search_mode": status["mode"],
        "source_files": memory.source_count(),
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
    }


@app.post("/search")
def search(request: SearchRequest):
    started = time.perf_counter()
    results = get_memory().search(request.query, request.limit)
    return {"results": results, "count": len(results), "elapsed_ms": round((time.perf_counter() - started) * 1000), "mode": "local"}


@app.post("/compare")
def compare(request: SearchRequest):
    started = time.perf_counter()
    results = get_memory().search(request.query, request.limit)
    return {"results": results, "count": len(results), "elapsed_ms": round((time.perf_counter() - started) * 1000), "mode": "local"}


def _context_text(request: GenerateRequest) -> str:
    memory = get_memory()
    guide = memory.style_guide()
    local_chunks = request.context[:12]
    evidence = "\n\n".join(
        f"[{item.get('file', 'local file')}:{item.get('line', '?')} | {item.get('kind', 'code')}]\n{item.get('text', '')}"
        for item in local_chunks
    )
    return f"STYLE GUIDE:\n{guide[:16000]}\n\nLOCAL EXAMPLES:\n{evidence[:24000]}"


def _event_stream(request: GenerateRequest):
    try:
        for text in stream_answer(request.prompt, _context_text(request), research=request.mode == "research"):
            if text.startswith("\u0000SOURCES:"):
                payload = {"sources": json.loads(text.split(":", 1)[1])}
                yield "event: sources\ndata: " + json.dumps(payload, ensure_ascii=False) + "\n\n"
            else:
                yield "data: " + json.dumps({"text": text}, ensure_ascii=False) + "\n\n"
        yield "event: done\ndata: {}\n\n"
    except Exception as exc:
        yield "event: error\ndata: " + json.dumps({"message": str(exc)}, ensure_ascii=False) + "\n\n"


@app.post("/generate")
def generate(request: GenerateRequest):
    return StreamingResponse(_event_stream(request), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/judge")
def judge(request: GenerateRequest):
    request.mode = "judge"
    return StreamingResponse(_event_stream(request), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
