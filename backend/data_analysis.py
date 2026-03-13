import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

# ============================================
# 1) LOAD DATASET
# ============================================

df = pd.read_csv("All_Diets.csv")
df.columns = df.columns.str.strip()

print("\n===========================================")
print(" DATASET OVERVIEW")
print("===========================================")
print(f"Rows, Columns: {df.shape}")
print("\nColumns:")
print(df.columns)


# ============================================
# 2) CHECK & HANDLE MISSING VALUES
# ============================================

MACRO_COLS = ["Protein(g)", "Carbs(g)", "Fat(g)"]

print("\n===========================================")
print(" MISSING VALUES (Protein / Carbs / Fat)")
print("===========================================")
print(df[MACRO_COLS].isna().sum())

# Fill missing values with column mean (if any)
for col in MACRO_COLS:
    if df[col].isna().any():
        df[col] = df[col].fillna(df[col].mean())


# ============================================
# 3) AVERAGE MACRONUTRIENTS PER DIET TYPE
# ============================================

avg_macros = df.groupby("Diet_type")[MACRO_COLS].mean().round(2)

print("\n===========================================")
print(" AVERAGE MACRONUTRIENTS PER DIET TYPE")
print("===========================================")
print(avg_macros)


# ============================================
# 4) TOP 5 PROTEIN-RICH RECIPES PER DIET
# ============================================

top_protein = (
    df.sort_values("Protein(g)", ascending=False)
      .groupby("Diet_type")
      .head(5)
)

print("\n===========================================")
print(" TOP 5 PROTEIN-RICH RECIPES PER DIET TYPE")
print("===========================================")
print(top_protein[["Diet_type", "Recipe_name", "Protein(g)", "Cuisine_type"]].round(2))


# ============================================
# 5) DIET WITH HIGHEST AVERAGE PROTEIN
# ============================================

highest_protein_diet = avg_macros["Protein(g)"].idxmax()

print("\n===========================================")
print(" DIET TYPE WITH HIGHEST AVERAGE PROTEIN")
print("===========================================")
print(f"Highest Protein Diet: {highest_protein_diet.upper()}")


# ============================================
# 6) MOST COMMON CUISINE PER DIET TYPE
# ============================================

def most_common(series):
    mode_vals = series.mode()
    return mode_vals.iloc[0] if not mode_vals.empty else "N/A"

common_cuisine = df.groupby("Diet_type")["Cuisine_type"].apply(most_common)

print("\n===========================================")
print(" MOST COMMON CUISINE PER DIET TYPE")
print("===========================================")
print(common_cuisine)


# ============================================
# 7) ADD RATIO COLUMNS (CLEAN + SAFE)
# ============================================

print("\n===========================================")
print(" RATIO COLUMNS (SAMPLE)")
print("===========================================")

df["Protein_to_Carbs_ratio"] = df["Protein(g)"] / df["Carbs(g)"]
df["Carbs_to_Fat_ratio"] = df["Carbs(g)"] / df["Fat(g)"]

# Replace infinite results (division by zero)
df.replace([float("inf"), -float("inf")], pd.NA, inplace=True)

# Convert safely to numeric
df["Protein_to_Carbs_ratio"] = pd.to_numeric(df["Protein_to_Carbs_ratio"], errors="coerce").round(3)
df["Carbs_to_Fat_ratio"] = pd.to_numeric(df["Carbs_to_Fat_ratio"], errors="coerce").round(3)

print(df[["Protein_to_Carbs_ratio", "Carbs_to_Fat_ratio"]].head())


# ============================================
# 8) VISUALIZATIONS
# ============================================

sns.set_style("whitegrid")

# -------- BAR CHART --------
plt.figure(figsize=(10, 6))
avg_macros.plot(kind="bar")
plt.title("Average Macronutrients per Diet Type")
plt.ylabel("Grams")
plt.xlabel("Diet Type")
plt.xticks(rotation=45)
plt.tight_layout()
plt.savefig("bar_avg_macros_by_diet.png", dpi=200)
plt.show()


# -------- HEATMAP --------
plt.figure(figsize=(8, 6))
sns.heatmap(avg_macros, annot=True, fmt=".2f", cmap="YlGnBu")
plt.title("Heatmap: Average Macronutrients by Diet Type")
plt.tight_layout()
plt.savefig("heatmap_macros_by_diet.png", dpi=200)
plt.show()


# -------- SCATTER PLOT --------
plt.figure(figsize=(10, 6))
sns.scatterplot(
    data=top_protein,
    x="Carbs(g)",
    y="Protein(g)",
    hue="Diet_type"
)
plt.title("Top 5 Protein Recipes: Protein vs Carbs")
plt.xlabel("Carbs (g)")
plt.ylabel("Protein (g)")
plt.tight_layout()
plt.savefig("scatter_top5_protein_recipes.png", dpi=200)
plt.show()


print("\n===========================================")
print(" CHART FILES SAVED:")
print(" - bar_avg_macros_by_diet.png")
print(" - heatmap_macros_by_diet.png")
print(" - scatter_top5_protein_recipes.png")
print("===========================================\n")
