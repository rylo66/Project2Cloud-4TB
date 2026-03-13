import azure.functions as func
import json
from lambda_function import process_nutritional_data_from_azurite

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

@app.route(route="analyze")
def analyze(req: func.HttpRequest) -> func.HttpResponse:
    try:
        message = process_nutritional_data_from_azurite()
        return func.HttpResponse(
            json.dumps({"message": message}),
            mimetype="application/json",
            status_code=200
        )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            mimetype="application/json",
            status_code=500
        )