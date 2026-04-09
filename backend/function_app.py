import json
import logging
import os
import time
from datetime import datetime, timezone

import azure.functions as func

from lambda_function import (
    DATASET_CONTAINER_NAME,
    RAW_DATASET_BLOB_NAME,
    get_cached_chart_data,
    process_and_cache_dataset,
    search_recipes,
)

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


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