import json
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import azure.functions as func

from auth_helpers import (
    create_jwt,
    create_user,
    decode_jwt,
    get_user_by_email,
    verify_google_token,
    verify_password,
)
from lambda_function import process_nutritional_data

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def get_json_body(req: func.HttpRequest) -> dict:
    try:
        return req.get_json()
    except ValueError:
        return {}


def get_bearer_token(req: func.HttpRequest) -> Optional[str]:
    auth_header = req.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.replace("Bearer ", "", 1).strip()
    return None


def json_response(payload: dict, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(payload),
        mimetype="application/json",
        status_code=status_code,
    )


def require_auth(req: func.HttpRequest) -> dict:
    token = get_bearer_token(req)
    if not token:
        raise PermissionError("Missing bearer token.")

    try:
        payload = decode_jwt(token)
    except Exception:
        raise PermissionError("Invalid or expired token.")

    email = payload.get("email")
    if not email:
        raise PermissionError("Invalid token payload.")

    user = get_user_by_email(email)
    if not user:
        raise PermissionError("User not found.")

    return user


# ---------------- ANALYZE ROUTE ---------------- #

@app.function_name(name="analyze")
@app.route(route="analyze", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def analyze(req: func.HttpRequest) -> func.HttpResponse:
    start = time.time()

    try:
        result = process_nutritional_data()
        execution_time = round(time.time() - start, 2)

        payload = {
            **result,
            "executionTime": f"{execution_time}s",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }

        return json_response(payload, 200)

    except Exception as e:
        logging.exception("Analyze failed")
        return json_response({"error": str(e)}, 500)


# ---------------- AUTH ROUTES ---------------- #

@app.function_name(name="register")
@app.route(route="auth/register", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def register(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        name = (body.get("name") or "").strip()
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""

        if not name or not email or not password:
            return json_response({"error": "Missing required fields"}, 400)

        if len(password) < 8:
            return json_response({"error": "Password must be at least 8 characters"}, 400)

        user = create_user(name=name, email=email, password=password)
        token = create_jwt(user)

        return json_response(
            {
                "token": token,
                "user": {
                    "name": user["name"],
                    "email": user["email"],
                },
            },
            201,
        )

    except ValueError as e:
        return json_response({"error": str(e)}, 400)

    except Exception as e:
        logging.exception("Register failed")
        return json_response({"error": str(e)}, 500)


@app.function_name(name="login")
@app.route(route="auth/login", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def login(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        email = (body.get("email") or "").strip().lower()
        password = body.get("password") or ""

        if not email or not password:
            return json_response({"error": "Email and password are required"}, 400)

        user = get_user_by_email(email)
        if not user:
            return json_response({"error": "Invalid credentials"}, 401)

        if not verify_password(password, user.get("passwordHash", "")):
            return json_response({"error": "Invalid credentials"}, 401)

        token = create_jwt(user)

        return json_response(
            {
                "token": token,
                "user": {
                    "name": user["name"],
                    "email": user["email"],
                },
            }
        )

    except Exception as e:
        logging.exception("Login failed")
        return json_response({"error": str(e)}, 500)


@app.function_name(name="me")
@app.route(route="auth/me", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
def me(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = require_auth(req)

        return json_response(
            {
                "user": {
                    "name": user["name"],
                    "email": user["email"],
                }
            }
        )

    except PermissionError as e:
        return json_response({"error": str(e)}, 401)

    except Exception as e:
        logging.exception("Get current user failed")
        return json_response({"error": str(e)}, 500)


@app.function_name(name="google_login")
@app.route(route="auth/google", methods=["POST"], auth_level=func.AuthLevel.ANONYMOUS)
def google_login(req: func.HttpRequest) -> func.HttpResponse:
    try:
        body = get_json_body(req)
        credential = body.get("credential")

        if not credential:
            return json_response({"error": "Missing credential"}, 400)

        info = verify_google_token(credential)
        email = (info.get("email") or "").strip().lower()
        name = (info.get("name") or "").strip()

        if not email:
            return json_response({"error": "Google account email not found"}, 400)

        user = get_user_by_email(email)
        if not user:
            user = create_user(
                name=name or "Google User",
                email=email,
                password="oauth_google_placeholder",
                provider="google",
            )

        token = create_jwt(user)

        return json_response(
            {
                "token": token,
                "user": {
                    "name": user["name"],
                    "email": user["email"],
                },
            }
        )

    except Exception as e:
        logging.exception("Google login failed")
        return json_response({"error": str(e)}, 500)