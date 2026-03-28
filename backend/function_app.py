"""
function_app.py — Azure Functions v2 Backend
Endpoints: POST /api/detect, POST /api/detect-batch
"""

import json
import hashlib
import logging
import os
import random
from datetime import datetime, timedelta

import azure.functions as func
from openai import AzureOpenAI

from detect.prompts import (
    SYSTEM_PROMPT_SINGLE,
    SYSTEM_PROMPT_BATCH,
    HUMOR_FALLBACKS,
    build_single_user_prompt,
    build_batch_user_prompt,
    score_to_label,
)

# ---- Azure Functions App ----
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

# ---- Azure OpenAI Client ----
client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_KEY"],
    api_version="2024-02-01",
)
DEPLOYMENT_NAME = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")

# ---- In-Memory Cache (MVP) ----
# key: text_hash → value: (result_dict, expires_at)
_cache: dict = {}
CACHE_TTL = timedelta(hours=24)


def _text_hash(text: str) -> str:
    normalized = text.strip().lower().replace("  ", " ")[:500]
    return hashlib.sha256(normalized.encode()).hexdigest()


def _cache_get(key: str) -> dict | None:
    if key in _cache:
        result, expires_at = _cache[key]
        if datetime.utcnow() < expires_at:
            return result
        del _cache[key]
    return None


def _cache_set(key: str, result: dict) -> None:
    _cache[key] = (result, datetime.utcnow() + CACHE_TTL)


def _parse_body(req: func.HttpRequest) -> dict:
    """JSON-Parsing: get_json() mit Bytes-Fallback."""
    try:
        result = req.get_json()
        if isinstance(result, dict):
            return result
    except Exception:
        pass
    return json.loads(req.get_body())


def _call_openai(system_prompt: str, user_prompt: str) -> str:
    """Ruft Azure OpenAI auf und gibt den Roh-String zurück."""
    response = client.chat.completions.create(
        model=DEPLOYMENT_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=300,
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content or ""


def _cors_headers() -> dict:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }


# ---- Endpoint: POST /api/detect ----
@app.route(route="detect", methods=["POST", "OPTIONS"])
def detect(req: func.HttpRequest) -> func.HttpResponse:
    headers = _cors_headers()

    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)

    try:
        body = _parse_body(req)
        text = body.get("text", "").strip()
        lang = body.get("lang", "de")

        if not text or len(text) < 20:
            return func.HttpResponse(
                json.dumps({"error": "Text zu kurz oder leer."}),
                status_code=400, headers=headers,
            )

        # Cache-Check
        hash_key = _text_hash(text)
        cached = _cache_get(hash_key)
        if cached:
            logging.info("[detect] Cache-Hit: %s", hash_key[:8])
            return func.HttpResponse(json.dumps(cached), headers=headers)

        # OpenAI aufrufen
        user_prompt = build_single_user_prompt(text, lang)
        raw_response = _call_openai(SYSTEM_PROMPT_SINGLE, user_prompt)
        parsed = json.loads(raw_response)

        score = float(parsed.get("score", 0.5))
        result = {
            "score": score,
            "label": score_to_label(score),
            "signals": parsed.get("signals", []),
            "explanation": parsed.get("explanation", ""),
            "humor": parsed.get("humor") or random.choice(HUMOR_FALLBACKS),
        }

        _cache_set(hash_key, result)
        return func.HttpResponse(json.dumps(result), headers=headers)

    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        return func.HttpResponse(
            json.dumps({"error": "Ungültiges JSON.", "detail": str(e)}),
            status_code=400, headers=headers,
        )
    except Exception as e:
        logging.exception("[detect] Fehler")
        return func.HttpResponse(
            json.dumps({"error": "Interner Fehler.", "detail": str(e)}),
            status_code=500, headers=headers,
        )


# ---- Endpoint: POST /api/detect-batch ----
@app.route(route="detect-batch", methods=["POST", "OPTIONS"])
def detect_batch(req: func.HttpRequest) -> func.HttpResponse:
    headers = _cors_headers()

    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=headers)

    try:
        body = _parse_body(req)
        posts = body.get("posts", [])

        if not posts or len(posts) > 5:
            return func.HttpResponse(
                json.dumps({"error": "1-5 Posts erforderlich."}),
                status_code=400, headers=headers,
            )

        results = []
        posts_to_analyze = []

        # Cache-Check für jeden Post
        for post in posts:
            text = post.get("text", "").strip()
            if len(text) < 20:
                results.append({
                    "id": post.get("id"), "score": None,
                    "label": "skipped", "explanation": "Text zu kurz.", "humor": None,
                })
                continue

            hash_key = _text_hash(text)
            cached = _cache_get(hash_key)
            if cached:
                logging.info("[detect-batch] Cache-Hit: %s", hash_key[:8])
                results.append({"id": post.get("id"), **cached})
            else:
                posts_to_analyze.append({**post, "_hash": hash_key})

        # Batch-Call für nicht gecachte Posts
        if posts_to_analyze:
            user_prompt = build_batch_user_prompt(posts_to_analyze)
            raw = _call_openai(SYSTEM_PROMPT_BATCH, user_prompt)

            # OpenAI kann entweder ein Array oder ein Objekt mit "results" zurückgeben
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                parsed = parsed.get("results", parsed.get("analyses", [parsed]))

            for item in parsed:
                post_id = item.get("id")
                score = float(item.get("score", 0.5))
                result = {
                    "id": post_id,
                    "score": score,
                    "label": score_to_label(score),
                    "signals": item.get("signals", []),
                    "explanation": item.get("explanation", ""),
                    "humor": item.get("humor") or random.choice(HUMOR_FALLBACKS),
                }

                # Cache befüllen
                matching_post = next((p for p in posts_to_analyze if p.get("id") == post_id), None)
                if matching_post:
                    _cache_set(matching_post["_hash"], {k: v for k, v in result.items() if k != "id"})

                results.append(result)

        return func.HttpResponse(json.dumps({"results": results}), headers=headers)

    except json.JSONDecodeError:
        return func.HttpResponse(
            json.dumps({"error": "Ungültiges JSON."}),
            status_code=400, headers=headers,
        )
    except Exception as e:
        logging.exception("[detect-batch] Fehler")
        return func.HttpResponse(
            json.dumps({"error": "Interner Fehler.", "detail": str(e)}),
            status_code=500, headers=headers,
        )
