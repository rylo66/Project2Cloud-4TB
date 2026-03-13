from azure.storage.blob import BlobServiceClient
import pandas as pd
import io
import json
import os

def process_nutritional_data_from_azurite():
    # Use the env var you already export in the terminal
    connect_str = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connect_str:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set.")

    blob_service_client = BlobServiceClient.from_connection_string(connect_str)

    container_name = "datasets"
    blob_name = "All_Diets.csv"

    print(f"Connecting to Azurite, downloading: {container_name}/{blob_name}")
    container_client = blob_service_client.get_container_client(container_name)
    blob_client = container_client.get_blob_client(blob_name)

    # Download blob content to bytes
    stream = blob_client.download_blob().readall()
    df = pd.read_csv(io.BytesIO(stream))

    # Calculate averages
    avg_macros = df.groupby("Diet_type")[["Protein(g)", "Carbs(g)", "Fat(g)"]].mean().round(2)

    # Save results locally as JSON (simulate NoSQL storage)
    os.makedirs("simulated_nosql", exist_ok=True)
    result = avg_macros.reset_index().to_dict(orient="records")

    with open("simulated_nosql/results.json", "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print("Wrote: simulated_nosql/results.json")
    return "Data processed and stored successfully."

# Run the function
if __name__ == "__main__":
    print(process_nutritional_data_from_azurite())
