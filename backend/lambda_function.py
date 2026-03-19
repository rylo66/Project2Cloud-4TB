from azure.storage.blob import BlobServiceClient
import pandas as pd
import io
import os

def load_dataset_from_blob():
    connect_str = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
    container_name = os.getenv("BLOB_CONTAINER_NAME", "datasets")
    blob_name = os.getenv("BLOB_FILE_NAME", "All_Diets.csv")

    blob_service_client = BlobServiceClient.from_connection_string(connect_str)
    blob_client = blob_service_client.get_blob_client(
        container=container_name,
        blob=blob_name,
    )

    stream = blob_client.download_blob().readall()
    df = pd.read_csv(io.BytesIO(stream))
    df.columns = [col.strip() for col in df.columns]
    return df

def process_nutritional_data():
    df = load_dataset_from_blob()

    avg_macros = (
        df.groupby("Diet_type")[["Protein(g)", "Carbs(g)", "Fat(g)"]]
        .mean()
        .round(2)
        .reset_index()
        .to_dict(orient="records")
    )

    diet_counts_df = (
        df["Diet_type"]
        .value_counts()
        .reset_index()
    )
    diet_counts_df.columns = ["diet", "count"]
    diet_counts = diet_counts_df.to_dict(orient="records")

    protein_scatter = (
        df[["Recipe_name", "Diet_type", "Protein(g)", "Carbs(g)"]]
        .dropna()
        .rename(columns={
            "Recipe_name": "recipe",
            "Diet_type": "diet",
            "Protein(g)": "protein",
            "Carbs(g)": "carbs",
        })
        .head(100)
        .to_dict(orient="records")
    )

    return {
        "avgMacros": avg_macros,
        "dietCounts": diet_counts,
        "proteinScatter": protein_scatter,
        "totalRecipes": int(len(df)),
    }
