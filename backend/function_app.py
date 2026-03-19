import azure.functions as func
import json
import time
from datetime import datetime, timezone
from lambda_function import process_nutritional_data

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="analyze")
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

        return func.HttpResponse(
            json.dumps(payload),
            mimetype="application/json",
            status_code=200,
        )

    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500,
        )
