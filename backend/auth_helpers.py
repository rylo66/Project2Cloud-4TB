import os
import time
import bcrypt
import jwt
from azure.cosmos import CosmosClient
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

COSMOS_ENDPOINT = os.environ["COSMOS_ENDPOINT"]
COSMOS_KEY = os.environ["COSMOS_KEY"]
COSMOS_DB_NAME = os.environ["COSMOS_DB_NAME"]
COSMOS_USERS_CONTAINER = os.environ["COSMOS_USERS_CONTAINER"]
JWT_SECRET = os.environ["JWT_SECRET"]
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

client = CosmosClient(COSMOS_ENDPOINT, credential=COSMOS_KEY)
db = client.get_database_client(COSMOS_DB_NAME)
users = db.get_container_client(COSMOS_USERS_CONTAINER)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def get_user_by_email(email: str):
    email_lower = normalize_email(email)
    query = "SELECT * FROM c WHERE c.emailLower = @email"
    items = list(
        users.query_items(
            query=query,
            parameters=[{"name": "@email", "value": email_lower}],
            enable_cross_partition_query=True,
        )
    )
    return items[0] if items else None


def create_user(
    name: str,
    email: str,
    password: str,
    provider: str = "local",
    google_sub: str | None = None,
):
    email_lower = normalize_email(email)
    existing = get_user_by_email(email_lower)
    if existing:
        raise ValueError("A user with that email already exists.")

    doc = {
        "id": email_lower,
        "email": email.strip(),
        "emailLower": email_lower,
        "name": name.strip(),
        "provider": provider,
        "passwordHash": hash_password(password) if provider == "local" else None,
        "googleSub": google_sub,
        "createdAt": int(time.time()),
    }
    return users.create_item(doc)


def create_jwt(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "provider": user.get("provider", "local"),
        "exp": int(time.time()) + 60 * 60 * 24 * 7,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def verify_google_token(token: str) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured.")

    info = id_token.verify_oauth2_token(
        token,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )
    return info