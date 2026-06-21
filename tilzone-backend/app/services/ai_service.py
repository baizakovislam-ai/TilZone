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

import re
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
    Защищен от:
    - Тегов <think>...</think> (DeepSeek, Qwen)
    - Markdown обёрток ```json ... ```
    - Мусора до и после JSON
    """
    default_response = {
        "thoughts": "",
        "response": "⚠️ I didn't catch that. Could you repeat?",
        "correction": None,
        "level_hint": "A1",
    }

    if not raw_text:
        return default_response

    # 1. Убираем теги <think>...</think> (для "мыслящих" моделей)
    text = re.sub(r'<think>.*?</think>', '', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()

    # 2. Убираем markdown обёртки ```json ... ```
    text = text.replace('```json', '').replace('```', '').strip()

    # 3. Ищем границы валидного JSON (первая { и последняя })
    start = text.find('{')
    end = text.rfind('}')
    
    if start != -1 and end != -1 and end > start:
        text = text[start:end+1]
    else:
        logger.warning("AI returned text without JSON boundaries: %s", raw_text[:100])
        # Пытаемся спасти хотя бы текст ответа через regex
        match = re.search(r'"response"\s*:\s*"((?:\\.|[^"\\])*)"', raw_text)
        if match:
            return {
                "thoughts": "",
                "response": match.group(1).strip(),
                "correction": None,
                "level_hint": "A1",
            }
        return default_response

    # 4. Парсим JSON
    try:
        data = json.loads(text)
        return {
            "thoughts": str(data.get("thoughts", "")).strip(),
            "response": str(data.get("response", "")).strip(),
            "correction": data.get("correction"),
            "level_hint": str(data.get("level_hint", "A1")),
        }
    except json.JSONDecodeError as e:
        logger.warning("Failed to parse AI JSON: %s | Raw: %s", str(e), text[:200])
        # Fallback: пытаемся вытащить response через regex, если json.loads упал
        match = re.search(r'"response"\s*:\s*"((?:\\.|[^"\\])*)"', raw_text)
        if match:
            return {
                "thoughts": "",
                "response": match.group(1).strip(),
                "correction": None,
                "level_hint": "A1",
            }
        return default_response


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