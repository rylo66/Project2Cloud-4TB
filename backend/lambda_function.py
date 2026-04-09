import io
import json
import math
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd
from azure.storage.blob import BlobServiceClient, ContentSettings

# -----------------------------
# Environment / blob config
# -----------------------------
AZURE_STORAGE_CONNECTION_STRING = os.environ["AZURE_STORAGE_CONNECTION_STRING"]

DATASET_CONTAINER_NAME = os.getenv("BLOB_CONTAINER_NAME", "datasets")
RAW_DATASET_BLOB_NAME = os.getenv("BLOB_FILE_NAME", "All_Diets.csv")

PROCESSED_CONTAINER_NAME = os.getenv("PROCESSED_CONTAINER_NAME", "processed")
CLEANED_BLOB_FILE_NAME = os.getenv("CLEANED_BLOB_FILE_NAME", "cleaned_diets.csv")
CHART_BLOB_FILE_NAME = os.getenv("CHART_BLOB_FILE_NAME", "chart_data.json")

MAX_SCATTER_POINTS = int(os.getenv("MAX_SCATTER_POINTS", "100"))


# -----------------------------
# Blob helpers
# -----------------------------
def get_blob_service_client() -> BlobServiceClient:
    return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)


def ensure_container(container_name: str) -> None:
    service = get_blob_service_client()
    container_client = service.get_container_client(container_name)
    if not container_client.exists():
        container_client.create_container()


def download_blob_bytes(container_name: str, blob_name: str) -> bytes:
    service = get_blob_service_client()
    blob_client = service.get_blob_client(container=container_name, blob=blob_name)
    return blob_client.download_blob().readall()


def upload_blob_text(
    container_name: str,
    blob_name: str,
    content: str,
    content_type: str,
) -> None:
    ensure_container(container_name)
    service = get_blob_service_client()
    blob_client = service.get_blob_client(container=container_name, blob=blob_name)
    blob_client.upload_blob(
        content.encode("utf-8"),
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type),
    )


# -----------------------------
# Column helpers
# -----------------------------
def normalize_column_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).strip().lower())


def build_column_lookup(df: pd.DataFrame) -> Dict[str, str]:
    return {normalize_column_name(col): col for col in df.columns}


def find_column(df: pd.DataFrame, *candidates: str) -> Optional[str]:
    lookup = build_column_lookup(df)
    for candidate in candidates:
        key = normalize_column_name(candidate)
        if key in lookup:
            return lookup[key]
    return None


# -----------------------------
# Dataset loading / cleaning
# -----------------------------
def load_dataset_from_blob() -> pd.DataFrame:
    raw = download_blob_bytes(DATASET_CONTAINER_NAME, RAW_DATASET_BLOB_NAME)
    df = pd.read_csv(io.BytesIO(raw))
    df.columns = [str(col).strip() for col in df.columns]
    return df


def load_cleaned_dataset_from_blob() -> pd.DataFrame:
    raw = download_blob_bytes(PROCESSED_CONTAINER_NAME, CLEANED_BLOB_FILE_NAME)
    df = pd.read_csv(io.BytesIO(raw))
    df.columns = [str(col).strip() for col in df.columns]
    return df


def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    cleaned = df.copy()
    cleaned.columns = [str(col).strip() for col in cleaned.columns]

    # Remove fully empty rows
    cleaned = cleaned.dropna(how="all")

    # Trim strings everywhere
    object_cols = cleaned.select_dtypes(include=["object"]).columns
    for col in object_cols:
        cleaned[col] = cleaned[col].astype(str).str.strip()
        cleaned.loc[cleaned[col].isin(["", "nan", "None"]), col] = pd.NA

    # Common columns
    recipe_col = find_column(cleaned, "Recipe_name", "Recipe", "Recipe Name", "Name")
    diet_col = find_column(cleaned, "Diet_type", "Diet", "Diet Type")

    # Standardize diet text
    if diet_col:
        cleaned[diet_col] = cleaned[diet_col].astype("string").str.strip().str.title()

    # Convert numeric columns
    for candidate in [
        "Protein(g)",
        "Protein",
        "Carbs(g)",
        "Carbs",
        "Fat(g)",
        "Fat",
        "Calories",
        "Calories(kcal)",
    ]:
        col = find_column(cleaned, candidate)
        if col:
            cleaned[col] = pd.to_numeric(cleaned[col], errors="coerce")

    # Drop rows missing core fields
    subset = []
    if recipe_col:
        subset.append(recipe_col)
    if diet_col:
        subset.append(diet_col)
    if subset:
        cleaned = cleaned.dropna(subset=subset)

    cleaned = cleaned.drop_duplicates()

    # Nice stable order for pagination/demo
    sort_cols = [col for col in [diet_col, recipe_col] if col]
    if sort_cols:
        cleaned = cleaned.sort_values(sort_cols, kind="stable")

    cleaned = cleaned.reset_index(drop=True)
    return cleaned


def save_cleaned_dataset_to_blob(df: pd.DataFrame) -> None:
    csv_text = df.to_csv(index=False)
    upload_blob_text(
        PROCESSED_CONTAINER_NAME,
        CLEANED_BLOB_FILE_NAME,
        csv_text,
        content_type="text/csv",
    )


# -----------------------------
# Chart data building
# -----------------------------
def clean_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return value


def dataframe_to_api_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    recipe_col = find_column(df, "Recipe_name", "Recipe", "Recipe Name", "Name")
    diet_col = find_column(df, "Diet_type", "Diet", "Diet Type")
    protein_col = find_column(df, "Protein(g)", "Protein")
    carbs_col = find_column(df, "Carbs(g)", "Carbs")
    fat_col = find_column(df, "Fat(g)", "Fat")
    cuisine_col = find_column(df, "Cuisine", "Cuisine Type")
    calories_col = find_column(df, "Calories", "Calories(kcal)")

    records: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        item = {
            "recipe": clean_value(row[recipe_col]) if recipe_col else None,
            "diet": clean_value(row[diet_col]) if diet_col else None,
            "protein": clean_value(row[protein_col]) if protein_col else None,
            "carbs": clean_value(row[carbs_col]) if carbs_col else None,
            "fat": clean_value(row[fat_col]) if fat_col else None,
            "cuisine": clean_value(row[cuisine_col]) if cuisine_col else None,
            "calories": clean_value(row[calories_col]) if calories_col else None,
        }

        # Also keep all original columns as camel-ish API keys
        for col in df.columns:
            api_key = re.sub(r"[^a-zA-Z0-9]+", "_", str(col).strip()).strip("_")
            api_key = api_key[:1].lower() + api_key[1:] if api_key else col
            item[api_key] = clean_value(row[col])

        records.append(item)

    return records


def build_chart_data(df: pd.DataFrame) -> Dict[str, Any]:
    diet_col = find_column(df, "Diet_type", "Diet", "Diet Type")
    recipe_col = find_column(df, "Recipe_name", "Recipe", "Recipe Name", "Name")
    protein_col = find_column(df, "Protein(g)", "Protein")
    carbs_col = find_column(df, "Carbs(g)", "Carbs")
    fat_col = find_column(df, "Fat(g)", "Fat")

    if not all([diet_col, recipe_col, protein_col, carbs_col, fat_col]):
        missing = [
            name
            for name, col in {
                "diet": diet_col,
                "recipe": recipe_col,
                "protein": protein_col,
                "carbs": carbs_col,
                "fat": fat_col,
            }.items()
            if not col
        ]
        raise ValueError(f"Missing required columns for chart building: {', '.join(missing)}")

    avg_macros_df = (
        df.groupby(diet_col)[[protein_col, carbs_col, fat_col]]
        .mean()
        .round(2)
        .reset_index()
        .rename(
            columns={
                diet_col: "diet",
                protein_col: "protein",
                carbs_col: "carbs",
                fat_col: "fat",
            }
        )
    )

    diet_counts_df = (
        df[diet_col]
        .value_counts(dropna=False)
        .rename_axis("diet")
        .reset_index(name="count")
    )

    scatter_df = (
        df[[recipe_col, diet_col, protein_col, carbs_col]]
        .dropna()
        .rename(
            columns={
                recipe_col: "recipe",
                diet_col: "diet",
                protein_col: "protein",
                carbs_col: "carbs",
            }
        )
        .head(MAX_SCATTER_POINTS)
    )

    payload = {
        "avgMacros": [
            {k: clean_value(v) for k, v in row.items()}
            for row in avg_macros_df.to_dict(orient="records")
        ],
        "dietCounts": [
            {k: clean_value(v) for k, v in row.items()}
            for row in diet_counts_df.to_dict(orient="records")
        ],
        "proteinScatter": [
            {k: clean_value(v) for k, v in row.items()}
            for row in scatter_df.to_dict(orient="records")
        ],
        "totalRecipes": int(len(df)),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    return payload


def save_chart_data_to_blob(payload: Dict[str, Any]) -> None:
    upload_blob_text(
        PROCESSED_CONTAINER_NAME,
        CHART_BLOB_FILE_NAME,
        json.dumps(payload, ensure_ascii=False),
        content_type="application/json",
    )


def get_cached_chart_data() -> Dict[str, Any]:
    raw = download_blob_bytes(PROCESSED_CONTAINER_NAME, CHART_BLOB_FILE_NAME)
    return json.loads(raw.decode("utf-8"))


# -----------------------------
# Main processing pipeline
# -----------------------------
def process_and_cache_dataset() -> Dict[str, Any]:
    raw_df = load_dataset_from_blob()
    cleaned_df = clean_dataset(raw_df)

    save_cleaned_dataset_to_blob(cleaned_df)

    chart_data = build_chart_data(cleaned_df)
    save_chart_data_to_blob(chart_data)

    return {
        "message": "Dataset processed and cached successfully.",
        "rawRows": int(len(raw_df)),
        "cleanedRows": int(len(cleaned_df)),
        "generatedAt": chart_data["generatedAt"],
        "processedContainer": PROCESSED_CONTAINER_NAME,
        "cleanedBlob": CLEANED_BLOB_FILE_NAME,
        "chartBlob": CHART_BLOB_FILE_NAME,
    }


# -----------------------------
# Search / filter / pagination
# -----------------------------
def search_recipes(
    diet: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 10,
) -> Dict[str, Any]:
    if page < 1:
        raise ValueError("page must be >= 1")

    if page_size < 1 or page_size > 100:
        raise ValueError("pageSize must be between 1 and 100")

    df = load_cleaned_dataset_from_blob()

    diet_col = find_column(df, "Diet_type", "Diet", "Diet Type")
    recipe_col = find_column(df, "Recipe_name", "Recipe", "Recipe Name", "Name")
    cuisine_col = find_column(df, "Cuisine", "Cuisine Type")
    ingredients_col = find_column(df, "Ingredients", "Ingredient", "Ingredient List")

    filtered = df.copy()

    if diet and diet_col:
        filtered = filtered[
            filtered[diet_col].astype("string").str.casefold() == diet.strip().casefold()
        ]

    if q:
        q = q.strip()
        if q:
            search_cols = [col for col in [recipe_col, diet_col, cuisine_col, ingredients_col] if col]
            if not search_cols:
                search_cols = list(filtered.select_dtypes(include=["object", "string"]).columns)

            if search_cols:
                mask = False
                for col in search_cols:
                    col_mask = (
                        filtered[col]
                        .astype("string")
                        .str.contains(re.escape(q), case=False, na=False)
                    )
                    mask = col_mask if isinstance(mask, bool) else (mask | col_mask)
                filtered = filtered[mask]

    total_items = int(len(filtered))
    total_pages = max(1, math.ceil(total_items / page_size))

    start = (page - 1) * page_size
    end = start + page_size
    page_df = filtered.iloc[start:end].reset_index(drop=True)

    return {
        "items": dataframe_to_api_records(page_df),
        "pagination": {
            "page": page,
            "pageSize": page_size,
            "totalItems": total_items,
            "totalPages": total_pages,
        },
        "filters": {
            "diet": diet,
            "q": q,
        },
    }