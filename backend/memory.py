"""Local R-Instat memory and source adapters."""
from __future__ import annotations

import re
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

APP_ROOT = Path(__file__).resolve().parents[1]
KNOWLEDGE_ROOT = APP_ROOT.parent
MEMORY_DIR = KNOWLEDGE_ROOT / "memory"
CHROMA_DIR = MEMORY_DIR / "rinstat_memory"
EMBEDDER_DIR = MEMORY_DIR / "local_embedder"
SOURCE_DIR = KNOWLEDGE_ROOT / "source" / "R-Instat-master"
STYLE_GUIDE_PATH = APP_ROOT / "backend" / "style_guide.md"


def _clean_metadata(metadata: dict[str, Any] | None, document: str, distance: float | None) -> dict[str, Any]:
    metadata = metadata or {}
    file_path = str(metadata.get("file") or metadata.get("path") or "Unknown file")
    return {
        "id": str(metadata.get("id") or ""),
        "file": file_path.replace("\\", "/"),
        "line": metadata.get("line"),
        "kind": str(metadata.get("kind") or "code"),
        "name": str(metadata.get("name") or ""),
        "text": document or "",
        # Chroma's default L2 distance is squared Euclidean distance. The
        # stored/query vectors are unit-normalized, so 1 - d/2 maps it to 0..1.
        "score": round(max(0.0, min(1.0, 1.0 - float(distance or 0.0) / 2.0)), 4),
    }


class KnowledgeBase:
    """Loads the local embedder and Chroma collection lazily, once per process."""

    def __init__(self) -> None:
        self._collection = None
        self._embedder = None
        self._tokenizer = None
        self._torch = None
        self._init_error: str | None = None
        self._chroma_checked = False

    def _open_chroma(self) -> None:
        if self._chroma_checked:
            return
        self._chroma_checked = True
        if not CHROMA_DIR.exists() or not EMBEDDER_DIR.exists():
            self._init_error = "Local Chroma memory or embedder folder is missing."
            return
        try:
            import chromadb
            from chromadb.config import Settings
            import torch
            from transformers import AutoModel, AutoTokenizer

            client = chromadb.PersistentClient(
                path=str(CHROMA_DIR),
                settings=Settings(anonymized_telemetry=False),
            )
            self._collection = client.get_collection("rinstat")
            self._tokenizer = AutoTokenizer.from_pretrained(str(EMBEDDER_DIR), local_files_only=True)
            self._embedder = AutoModel.from_pretrained(str(EMBEDDER_DIR), local_files_only=True).eval()
            self._torch = torch
        except Exception as exc:  # SQLite/source search remains available without optional ML packages.
            self._init_error = f"Vector search unavailable: {exc}"
            self._collection = None
            self._embedder = None

    def search(self, query: str, limit: int = 12) -> list[dict[str, Any]]:
        query = query.strip()
        if not query:
            return []
        self._open_chroma()
        if self._collection is not None and self._embedder is not None:
            try:
                tokens = self._tokenizer([query], padding=True, truncation=True, return_tensors="pt")
                with self._torch.inference_mode():
                    hidden = self._embedder(**tokens).last_hidden_state[:, 0, :]
                    vector = self._torch.nn.functional.normalize(hidden, p=2, dim=1).cpu().tolist()
                result = self._collection.query(
                    query_embeddings=vector,
                    n_results=max(1, min(limit, 40)),
                    include=["documents", "metadatas", "distances"],
                )
                docs = (result.get("documents") or [[]])[0]
                metas = (result.get("metadatas") or [[]])[0]
                distances = (result.get("distances") or [[]])[0]
                ids = (result.get("ids") or [[]])[0]
                chunks = []
                for i, doc in enumerate(docs):
                    item = _clean_metadata(metas[i] if i < len(metas) else None, doc, distances[i] if i < len(distances) else None)
                    item["id"] = ids[i] if i < len(ids) else item["id"]
                    chunks.append(item)
                return chunks
            except Exception as exc:
                self._init_error = f"Vector query failed: {exc}"
        return self._sqlite_search(query, limit)

    def _sqlite_search(self, query: str, limit: int) -> list[dict[str, Any]]:
        """Search Chroma's stored documents lexically when vector dependencies are absent."""
        db_file = CHROMA_DIR / "chroma.sqlite3"
        if not db_file.exists():
            return self._source_search(query, limit)
        terms = list(dict.fromkeys(re.findall(r"[A-Za-z0-9_]{3,}", query.lower())))[:8]
        if not terms:
            return []
        where = " OR ".join(["lower(d.string_value) LIKE ?"] * len(terms))
        params = [f"%{term}%" for term in terms]
        sql = f"""
            SELECT e.id, e.embedding_id,
              MAX(CASE WHEN m.key='file' THEN m.string_value END) AS file,
              MAX(CASE WHEN m.key='line' THEN COALESCE(CAST(m.int_value AS TEXT), m.string_value) END) AS line,
              MAX(CASE WHEN m.key='kind' THEN m.string_value END) AS kind,
              MAX(CASE WHEN m.key='name' THEN m.string_value END) AS name,
              MAX(CASE WHEN m.key='chroma:document' THEN m.string_value END) AS document
            FROM embeddings e
            JOIN embedding_metadata d ON d.id=e.id AND d.key='chroma:document'
            JOIN embedding_metadata m ON m.id=e.id
            WHERE ({where})
            GROUP BY e.id
            LIMIT 1600
        """
        try:
            with sqlite3.connect(f"file:{db_file.as_posix()}?mode=ro", uri=True, timeout=5) as conn:
                rows = conn.execute(sql, params).fetchall()
        except (sqlite3.Error, OSError):
            return self._source_search(query, limit)
        scored = []
        for row in rows:
            _, chunk_id, file_path, line, kind, name, document = row
            text = document or ""
            lowered = text.lower()
            hits = sum(1 for term in terms if term in lowered)
            if not hits:
                continue
            item = _clean_metadata({"id": chunk_id, "file": file_path, "line": line, "kind": kind, "name": name}, text, 1.0 - min(0.98, hits / max(len(terms), 1)))
            item["score"] = round(hits / max(len(terms), 1), 4)
            scored.append(item)
        scored.sort(key=lambda item: (item["score"], len(item["text"])), reverse=True)
        return scored[:max(1, min(limit, 40))]

    def _source_search(self, query: str, limit: int) -> list[dict[str, Any]]:
        terms = list(dict.fromkeys(re.findall(r"[A-Za-z0-9_]{3,}", query.lower())))[:8]
        results: list[dict[str, Any]] = []
        for path in SOURCE_DIR.rglob("*.vb"):
            if any(part.lower() in {"packages", "bin", "obj", ".git"} for part in path.parts):
                continue
            try:
                lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
            except OSError:
                continue
            for index, line in enumerate(lines):
                lowered = line.lower()
                hits = sum(term in lowered for term in terms)
                if hits:
                    results.append({"id": "", "file": path.relative_to(SOURCE_DIR).as_posix(), "line": index + 1, "kind": "source", "name": path.stem, "text": line.strip(), "score": round(hits / max(len(terms), 1), 4)})
        results.sort(key=lambda item: (item["score"], len(item["text"])), reverse=True)
        return results[:max(1, min(limit, 40))]

    def status(self) -> dict[str, Any]:
        if self._collection is not None and self._embedder is not None:
            mode = "vector"
        elif self._chroma_checked:
            mode = "lexical"
        else:
            mode = "loading" if CHROMA_DIR.exists() and EMBEDDER_DIR.exists() else "lexical"
        return {
            "mode": mode,
            "memory_exists": CHROMA_DIR.exists(),
            "model_exists": EMBEDDER_DIR.exists(),
            "detail": self._init_error,
        }

    def source_count(self) -> int:
        if not SOURCE_DIR.exists():
            return 0
        return sum(1 for _ in SOURCE_DIR.rglob("*.vb"))

    def style_guide(self) -> str:
        try:
            return STYLE_GUIDE_PATH.read_text(encoding="utf-8")
        except OSError:
            return ""


@lru_cache(maxsize=1)
def get_memory() -> KnowledgeBase:
    return KnowledgeBase()
