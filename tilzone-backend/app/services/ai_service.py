"""
Production-level AI service for chat.

Поддерживает:
- Ollama (локально)
- Groq API (облако, бесплатно)

Особенности:
- Thread-safe клиент
- Timeout
- Ограничение history
- Защита от кривых ответов AI
- Логирование
- Fail-safe парсинг JSON
"""

import json
import logging
import asyncio
from typing import Any, List, Dict, cast  # Добавили cast
from openai.types.chat import ChatCompletionMessageParam # Добавили тип для OpenAI

from ollama import Client
from openai import OpenAI

from app.config import settings
from app.services.ai_prompts import build_system_prompt

logger = logging.getLogger(__name__)

# =========================
# CONFIG
# =========================

MAX_HISTORY = 10
REQUEST_TIMEOUT = 60

# =========================
# CLIENTS (singletons)
# =========================

_ollama_client: Client | None = None
_groq_client: OpenAI | None = None


def get_ollama_client() -> Client:
    global _ollama_client

    if _ollama_client is None:
        _ollama_client = Client(
            host="http://localhost:11434"
        )

    return _ollama_client


def get_groq_client() -> OpenAI:
    global _groq_client

    if _groq_client is None:
        _groq_client = OpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1",
        )

    return _groq_client


# =========================
# RESPONSE PARSER
# =========================

def _parse_ai_response(raw_text: str) -> dict[str, Any]:
    """
    Безопасный парсинг ответа AI.

    Модель может вернуть:
    - markdown ```json
    - невалидный JSON
    - обычный текст
    """

    if not raw_text:
        return {
            "response": "⚠️ Empty response from AI",
            "correction": None,
            "level_hint": "A1",
        }

    text = raw_text.strip()

    if text.startswith("```"):
        lines = text.split("\n")

        if len(lines) > 2:
            text = "\n".join(lines[1:-1])

    try:
        data = json.loads(text)

        return {
            "response": str(data.get("response", "")).strip(),
            "correction": data.get("correction"),
            "level_hint": str(data.get("level_hint", "A1")),
        }

    except Exception:
        logger.warning("AI returned non-JSON response")

        return {
            "response": text,
            "correction": None,
            "level_hint": "A1",
        }


# =========================
# OLLAMA CALL
# =========================

def _call_ollama(
    *,
    message: str,
    scenario: str,
    history: List[Dict],
    study_language: str,
    native_language: str,
    level: str,
) -> dict[str, Any]:

    client = get_ollama_client()

    system_prompt = build_system_prompt(
        scenario=scenario,
        study_language=study_language,
        native_language=native_language,
        level=level,
    )

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    messages.extend(history)

    messages.append(
        {
            "role": "user",
            "content": message,
        }
    )

    response = client.chat(
        model=settings.ollama_model,
        messages=messages,
        options={
            "temperature": 0.7,
        },
    )

    if not response:
        raise RuntimeError("Empty response from Ollama")

    if "message" not in response:
        raise RuntimeError("Invalid Ollama response")

    raw_text = response["message"]["content"]

    if not raw_text:
        raise RuntimeError("No content returned by Ollama")

    return _parse_ai_response(raw_text)


# =========================
# GROQ CALL
# =========================

def _call_groq(
    *,
    message: str,
    scenario: str,
    history: List[Dict],
    study_language: str,
    native_language: str,
    level: str,
) -> dict[str, Any]:

    client = get_groq_client()

    system_prompt = build_system_prompt(
        scenario=scenario,
        study_language=study_language,
        native_language=native_language,
        level=level,
    )

    messages = [
        {
            "role": "system",
            "content": system_prompt,
        }
    ]

    messages.extend(history)

    messages.append(
        {
            "role": "user",
            "content": message,
        }
    )

    response = client.chat.completions.create(
        model=settings.groq_model,
        messages=cast(list[ChatCompletionMessageParam], messages),
        temperature=0.7,
        max_tokens=500,
    )

    if not response or not response.choices:
        raise RuntimeError("Empty response from Groq")

    raw_text = response.choices[0].message.content

    if not raw_text:
        raise RuntimeError("No content returned by Groq")

    return _parse_ai_response(raw_text)


# =========================
# PUBLIC FUNCTION
# =========================

async def call_ai_chat(
    *,
    message: str,
    scenario: str,
    history: List[Dict],
    study_language: str = "en",
    native_language: str = "ru",
    level: str = "A1",
    user_id: str | None = None,
) -> dict[str, Any]:

    if not message or not message.strip():
        raise RuntimeError("Empty message")

    history = history[-MAX_HISTORY:]

    # Выбираем провайдера из конфига
    provider = getattr(settings, "ai_provider", "ollama").lower()
    provider_name = "Unknown"
    try:
        if provider == "groq":
            call_func = _call_groq
            provider_name = "Groq"
        else:
            call_func = _call_ollama
            provider_name = "Ollama"

        result = await asyncio.wait_for(
            asyncio.to_thread(
                call_func,
                message=message,
                scenario=scenario,
                history=history,
                study_language=study_language,
                native_language=native_language,
                level=level,
            ),
            timeout=REQUEST_TIMEOUT,
        )

        return result

    except asyncio.TimeoutError:
        logger.error(
            "%s timeout | user_id=%s scenario=%s",
            provider_name,
            user_id,
            scenario,
        )

        raise RuntimeError("AI timeout")

    except Exception as e:
        logger.exception(
            "%s error | user_id=%s scenario=%s",
            provider_name,
            user_id,
            scenario,
        )

        raise RuntimeError(str(e))