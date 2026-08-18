"""
Thin wrapper around Google's official Gemini SDK (google-generativeai).

Requires GEMINI_API_KEY in the environment. Create one for free at:
https://aistudio.google.com/apikey
"""
import os
import asyncio
import logging

import google.generativeai as genai

log = logging.getLogger("gemini_client")

_configured = False


def _ensure_configured():
    global _configured
    if _configured:
        return
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set")
    genai.configure(api_key=key)
    _configured = True


async def gemini_text(system_message: str, user_text: str, model: str = "gemini-3.6-flash") -> str:
    """Single-turn text generation (chatbot replies, item descriptions, etc.)."""
    _ensure_configured()

    def _call():
        m = genai.GenerativeModel(model, system_instruction=system_message)
        resp = m.generate_content(user_text)
        return (resp.text or "").strip()

    return await asyncio.to_thread(_call)


async def gemini_vision(system_message: str, user_text: str, file_bytes: bytes,
                         mime_type: str, model: str = "gemini-3.6-flash") -> str:
    """Single-turn multimodal (image/PDF + text) generation, e.g. menu extraction."""
    _ensure_configured()

    def _call():
        m = genai.GenerativeModel(model, system_instruction=system_message)
        resp = m.generate_content([{"mime_type": mime_type, "data": file_bytes}, user_text])
        return (resp.text or "").strip()

    return await asyncio.to_thread(_call)
