"""Gemini streaming helpers. Network calls happen only after an explicit UI action."""
from __future__ import annotations

import json
import os
from collections.abc import Iterator
from pathlib import Path


RESEARCH_SKILL_PATH = Path(__file__).with_name("research_skill.md")


def _client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Gemini is not configured. Set GEMINI_API_KEY in the backend environment.")
    from google import genai
    return genai.Client(api_key=api_key)


def stream_answer(prompt: str, context: str = "", *, research: bool = False) -> Iterator[str]:
    """Yield text chunks, then a JSON event containing any web citations."""
    if not os.getenv("GEMINI_API_KEY", "").strip():
        raise RuntimeError("Gemini is not configured. Set GEMINI_API_KEY in the backend environment.")
    from google.genai import types

    client = _client()
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    system = (
        "You are R-Instat Knowledge, an assistant for R-Instat VB.NET dialog development. "
        "Treat the supplied style guide as authoritative. Clearly distinguish verified repository examples "
        "from suggestions. Never claim a pattern exists unless it appears in the supplied local evidence."
    )
    if research:
        research_skill = RESEARCH_SKILL_PATH.read_text(encoding="utf-8").strip()
        system += "\n\nRESEARCH SKILL (apply to every Research request):\n" + research_skill
    full_prompt = f"LOCAL STYLE GUIDE AND REPOSITORY EVIDENCE:\n{context}\n\nUSER REQUEST:\n{prompt}"
    tools = [types.Tool(google_search=types.GoogleSearch())] if research else None
    config = types.GenerateContentConfig(system_instruction=system, tools=tools)
    sources: list[dict[str, str]] = []
    for part in client.models.generate_content_stream(model=model, contents=full_prompt, config=config):
        if getattr(part, "text", None):
            yield part.text
        candidates = getattr(part, "candidates", None) or []
        for candidate in candidates:
            grounding = getattr(candidate, "grounding_metadata", None)
            chunks = getattr(grounding, "grounding_chunks", None) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if web and getattr(web, "uri", None):
                    item = {"title": getattr(web, "title", "Web source"), "url": web.uri}
                    if item not in sources:
                        sources.append(item)
    yield "\n\n"
    yield "\u0000SOURCES:" + json.dumps(sources)
