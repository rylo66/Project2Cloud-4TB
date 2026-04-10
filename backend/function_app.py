import json
import logging
import os
import time
from datetime import datetime, timezone

from auth_helpers import (
    create_jwt,
    create_user,
    decode_jwt,
    get_user_by_email,
    verify_password,
    verify_google_token,
)

import azure.functions as func

from lambda_function import (
    DATASET_CONTAINER_NAME,
    RAW_DATASET_BLOB_NAME,
    get_cached_chart_data,
    process_and_cache_dataset,
    search_recipes,
)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

def get_json_body(req: func.HttpRequest) -> dict:
    try:
        return req.get_json()
    except ValueError:
        return {}

def get_bearer_token(req: func.HttpRequest) -> str | None:
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.replace("Bearer ", "", 1).strip()
    return None


def json_response(payload: dict, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload, ensure_ascii=False),
        mimetype="application/json",
        status_code=status_code,
    )


def parse_int_query(req: func.HttpRequest, key: str, default: int) -> int:
    raw = req.params.get(key)
    if raw is None or raw == "":
        return default
    return int(raw)


@app.function_name(name="analyze")
@app.route(route="analyze", methods=["GET"])
def analyze(req: func.HttpRequest) -> func.HttpResponse:
    start = time.time()

    try:
        payload = get_cached_chart_data()
        payload["source"] = "cache"
        payload["executionTime"] = f"{round(time.time() - start, 2)}s"
        payload["servedAt"] = datetime.now(timezone.utc).isoformat()
        return json_response(payload, 200)

    except FileNotFoundError:
        # Handy during local testing if the trigger hasn't run yet.
        if os.getenv("ALLOW_LIVE_REBUILD", "false").lower() == "true":
            process_and_cache_dataset()
            payload = get_cached_chart_data()
            payload["source"] = "cache-after-rebuild"
            payload["executionTime"] = f"{round(time.time() - start, 2)}s"
            payload["servedAt"] = datetime.now(timezone.utc).isoformat()
            return json_response(payload, 200)

        return json_response(
            {
                "error": (
                    "Cached chart data not found yet. Upload or update "
                    f"{RAW_DATASET_BLOB_NAME} to trigger preprocessing first."
                )
            },
            404,
        )

    except Exception as exc:
        logging.exception("Analyze endpoint failed.")
        return json_response({"error": str(exc)}, 500)


@app.function_name(name="recipes")
@app.route(route="recipes", methods=["GET"])
def recipes(req: func.HttpRequest) -> func.HttpResponse:
    try:
        diet = req.params.get("diet")
        q = req.params.get("q")
        page = parse_int_query(req, "page", 1)
        page_size = parse_int_query(req, "pageSize", 10)

        payload = search_recipes(
            diet=diet,
            q=q,
            page=page,
            page_size=page_size,
        )
        payload["source"] = "cleaned-data-cache"
        payload["servedAt"] = datetime.now(timezone.utc).isoformat()
        return json_response(payload, 200)

    except ValueError as exc:
        return json_response({"error": str(exc)}, 400)

    except FileNotFoundError:
        if os.getenv("ALLOW_LIVE_REBUILD", "false").lower() == "true":
            process_and_cache_dataset()
            diet = req.params.get("diet")
            q = req.params.get("q")
            page = parse_int_query(req, "page", 1)
            page_size = parse_int_query(req, "pageSize", 10)

            payload = search_recipes(
                diet=diet,
                q=q,
                page=page,
                page_size=page_size,
            )
            payload["source"] = "cleaned-data-cache-after-rebuild"
            payload["servedAt"] = datetime.now(timezone.utc).isoformat()
            return json_response(payload, 200)

        return json_response(
            {
                "error": (
                    "Cleaned dataset not found yet. Upload or update "
                    f"{RAW_DATASET_BLOB_NAME} to generate cleaned_diets.csv first."
                )
            },
            404,
        )

    except Exception as exc:
        logging.exception("Recipes endpoint failed.")
        return json_response({"error": str(exc)}, 500)


@app.function_name(name="process_dataset_on_blob_change")
@app.blob_trigger(
    arg_name="myblob",
    path=f"{DATASET_CONTAINER_NAME}/{{name}}",
    connection="AZURE_STORAGE_CONNECTION_STRING",
)
def process_dataset_on_blob_change(myblob: func.InputStream) -> None:
    try:
        blob_name = os.path.basename(myblob.name)

        # Only process the main CSV, not every file dropped in the container.
        if blob_name.lower() != os.path.basename(RAW_DATASET_BLOB_NAME).lower():
            logging.info(
                "Skipping blob '%s'. Waiting for '%s'.",
                blob_name,
                RAW_DATASET_BLOB_NAME,
            )
            return

        logging.info(
            "Blob trigger fired for %s (%s bytes). Starting preprocess...",
            myblob.name,
            myblob.length,
        )

        result = process_and_cache_dataset()
        logging.info("Preprocess complete: %s", result)

    except Exception:
        logging.exception("Blob trigger processing failed.")
        raise

    @app.function_name(name="register")
@app.route(route="auth/register", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def register(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        name = (body.get("name") or "").strip()
        email = (body.get("email") or "").strip()
        password = body.get("password") or ""

        if not name or not email or not password:
            return json_response({"error": "Name, email, and password are required."}, 400)

        if len(password) < 8:
            return json_response({"error": "Password must be at least 8 characters."}, 400)

        user = create_user(name=name, email=email, password=password)
        token = create_jwt(user)

        return json_response({
            "token": token,
            "user": {
                "name": user["name"],
                "email": user["email"],
                "provider": user["provider"],
            }
        }, 201)
    except ValueError as exc:
        return json_response({"error": str(exc)}, 400)
    except Exception as exc:
        logging.exception("Register failed.")
        return json_response({"error": str(exc)}, 500)


@app.function_name(name="login")
@app.route(route="auth/login", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def login(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        email = (body.get("email") or "").strip()
        password = body.get("password") or ""

        user = get_user_by_email(email)
        if not user or user.get("provider") != "local":
            return json_response({"error": "Invalid email or password."}, 401)

        if not verify_password(password, user["passwordHash"]):
            return json_response({"error": "Invalid email or password."}, 401)

        token = create_jwt(user)
        return json_response({
            "token": token,
            "user": {
                "name": user["name"],
                "email": user["email"],
                "provider": user["provider"],
            }
        })
    except Exception as exc:
        logging.exception("Login failed.")
        return json_response({"error": str(exc)}, 500)


@app.function_name(name="me")
@app.route(route="auth/me", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def me(req: func.HttpRequest) -> func.HttpResponse:
    try:
        token = get_bearer_token(req)
        if not token:
            return json_response({"error": "Missing token."}, 401)

        payload = decode_jwt(token)
        return json_response({
            "user": {
                "name": payload["name"],
                "email": payload["email"],
                "provider": payload["provider"],
            }
        })
    except Exception:
        return json_response({"error": "Invalid or expired token."}, 401)


@app.function_name(name="google_login")
@app.route(route="auth/google", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def google_login(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        credential = body.get("credential")
        if not credential:
            return json_response({"error": "Missing Google credential."}, 400)

        info = verify_google_token(credential)
        email = info["email"]
        name = info.get("name") or email.split("@")[0]
        sub = info["sub"]

        user = get_user_by_email(email)
        if not user:
            user = create_user(
                name=name,
                email=email,
                password="oauth-no-password",
                provider="google",
                google_sub=sub,
            )

        token = create_jwt(user)
        return json_response({
            "token": token,
            "user": {
                "name": user["name"],
                "email": user["email"],
                "provider": user["provider"],
            }
        })
    except Exception as exc:
        logging.exception("Google login failed.")
        return json_response({"error": str(exc)}, 500)