"""
Сервис AI-собеседника.
Оборачивает вызовы Anthropic API, парсит JSON-ответы,
сохраняет историю диалога в БД.
"""

import json
import logging
from typing import Any

import anthropic

from app.config import settings
from app.services.ai_prompts import build_system_prompt

logger = logging.getLogger(__name__)

# Один клиент на весь процесс (thread-safe)
_client: anthropic.Anthropic | None = None


def get_anthropic_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        if not settings.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY не задан. "
                "Добавьте его в .env файл: ANTHROPIC_API_KEY=sk-ant-..."
            )
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _parse_ai_response(raw_text: str) -> dict[str, Any]:
    """
    Парсит JSON-ответ от Claude.
    Если Claude вернул не валидный JSON — возвращает весь текст как response.
    """
    text = raw_text.strip()

    # Убираем возможные markdown-блоки ```json ... ```
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        data = json.loads(text)
        return {
            "response":   str(data.get("response", text)),
            "correction": data.get("correction") or None,
            "level_hint": str(data.get("level_hint", "A1")),
        }
    except (json.JSONDecodeError, ValueError):
        logger.warning("Claude returned non-JSON response, using raw text")
        return {
            "response":   text,
            "correction": None,
            "level_hint": "A1",
        }


def call_ai_chat(
    *,
    message: str,
    scenario: str,
    history: list[dict],          # [{"role": "user"|"assistant", "content": str}]
    study_language: str = "en",
    native_language: str = "ru",
    level: str = "A1",
) -> dict[str, Any]:
    """
    Синхронный вызов Anthropic Messages API.
    Возвращает dict: {response, correction, level_hint}
    """
    client = get_anthropic_client()

    system_prompt = build_system_prompt(
        scenario=scenario,
        study_language=study_language,
        native_language=native_language,
        level=level,
    )

    # Добавляем текущее сообщение пользователя в историю
    messages = history + [{"role": "user", "content": message}]

    try:
        response = client.messages.create(
            model=settings.ai_model,
            max_tokens=settings.ai_max_tokens,
            system=system_prompt,
            messages=messages,
        )
        raw_text = response.content[0].text
        return _parse_ai_response(raw_text)

    except anthropic.AuthenticationError:
        raise RuntimeError("Неверный ANTHROPIC_API_KEY. Проверьте .env файл.")
    except anthropic.RateLimitError:
        raise RuntimeError("Превышен лимит запросов к Anthropic API. Попробуйте позже.")
    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        raise RuntimeError(f"Ошибка Anthropic API: {e}")