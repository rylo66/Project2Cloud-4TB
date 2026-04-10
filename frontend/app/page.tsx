"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Bar, Pie, Scatter } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const API_BASE = "/api";

type AvgMacro = {
  diet: string;
  protein: number;
  carbs: number;
  fat: number;
};

type DietCount = {
  diet: string;
  count: number;
};

type ProteinPoint = {
  recipe: string;
  diet: string;
  protein: number;
  carbs: number;
};

type DashboardResponse = {
  avgMacros: AvgMacro[];
  dietCounts: DietCount[];
  proteinScatter: ProteinPoint[];
  totalRecipes: number;
  executionTime?: string;
  generatedAt?: string;
  source?: string;
  servedAt?: string;
};

type RecipeItem = {
  recipe?: string;
  diet?: string;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  cuisine?: string | null;
  calories?: number | null;
};

type RecipesResponse = {
  items: RecipeItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    diet?: string | null;
    q?: string | null;
  };
  source?: string;
  servedAt?: string;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toFixed(1);
}

function normalizeValue(value: number, max: number) {
  if (!max || max <= 0) return 0.15;
  return Math.max(0.15, value / max);
}

export default function Page() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [recipes, setRecipes] = useState<RecipesResponse | null>(null);

  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  const [dashboardError, setDashboardError] = useState("");
  const [recipesError, setRecipesError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [diet, setDiet] = useState("");
  const [page, setPage] = useState(1);

  const pageSize = 10;

  const dietOptions = useMemo(() => {
    return dashboard?.dietCounts?.map((item) => item.diet).filter(Boolean) ?? [];
  }, [dashboard]);

  const heatmapRows = useMemo(() => {
    if (!dashboard?.avgMacros?.length) return [];
    return dashboard.avgMacros;
  }, [dashboard]);

  const maxMacroValue = useMemo(() => {
    if (!dashboard?.avgMacros?.length) return 0;
    return Math.max(
      ...dashboard.avgMacros.flatMap((item) => [
        item.protein || 0,
        item.carbs || 0,
        item.fat || 0,
      ])
    );
  }, [dashboard]);

  const clusterSummary = useMemo(() => {
    if (!dashboard?.proteinScatter?.length) {
      return {
        highProteinHighCarb: 0,
        highProteinLowCarb: 0,
        lowProteinHighCarb: 0,
        balanced: 0,
      };
    }

    const avgProtein =
      dashboard.proteinScatter.reduce((sum, item) => sum + (item.protein || 0), 0) /
      dashboard.proteinScatter.length;

    const avgCarbs =
      dashboard.proteinScatter.reduce((sum, item) => sum + (item.carbs || 0), 0) /
      dashboard.proteinScatter.length;

    const summary = {
      highProteinHighCarb: 0,
      highProteinLowCarb: 0,
      lowProteinHighCarb: 0,
      balanced: 0,
    };

    dashboard.proteinScatter.forEach((item) => {
      const protein = item.protein || 0;
      const carbs = item.carbs || 0;

      if (protein >= avgProtein && carbs >= avgCarbs) {
        summary.highProteinHighCarb += 1;
      } else if (protein >= avgProtein && carbs < avgCarbs) {
        summary.highProteinLowCarb += 1;
      } else if (protein < avgProtein && carbs >= avgCarbs) {
        summary.lowProteinHighCarb += 1;
      } else {
        summary.balanced += 1;
      }
    });

    return summary;
  }, [dashboard]);

  const fetchDashboard = async () => {
    try {
      setLoadingDashboard(true);
      setDashboardError("");

      const response = await fetch(`${API_BASE}/analyze`, { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load dashboard analytics.");
      }

      const json: DashboardResponse = await response.json();
      setDashboard(json);
    } catch (error) {
      console.error(error);
      setDashboardError("Could not load nutritional insights.");
    } finally {
      setLoadingDashboard(false);
    }
  };

  const fetchRecipes = async (
    selectedDiet = diet,
    selectedKeyword = keyword,
    selectedPage = page
  ) => {
    try {
      setLoadingRecipes(true);
      setRecipesError("");

      const params = new URLSearchParams();
      if (selectedDiet) params.set("diet", selectedDiet);
      if (selectedKeyword) params.set("q", selectedKeyword);
      params.set("page", String(selectedPage));
      params.set("pageSize", String(pageSize));

      const response = await fetch(`${API_BASE}/recipes?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to load recipes.");
      }

      const json: RecipesResponse = await response.json();
      setRecipes(json);
    } catch (error) {
      console.error(error);
      setRecipesError("Could not load recipes.");
    } finally {
      setLoadingRecipes(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    fetchRecipes(diet, keyword, page);
  }, [diet, keyword, page]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setKeyword(keywordInput.trim());
  };

  const handleReset = () => {
    setKeywordInput("");
    setKeyword("");
    setDiet("");
    setPage(1);
    setInfoMessage("");
  };

  const barData = {
    labels: dashboard?.avgMacros?.map((item) => item.diet) ?? [],
    datasets: [
      {
        label: "Protein (g)",
        data: dashboard?.avgMacros?.map((item) => item.protein) ?? [],
      },
      {
        label: "Carbs (g)",
        data: dashboard?.avgMacros?.map((item) => item.carbs) ?? [],
      },
      {
        label: "Fat (g)",
        data: dashboard?.avgMacros?.map((item) => item.fat) ?? [],
      },
    ],
  };

  const pieData = {
    labels: dashboard?.dietCounts?.map((item) => item.diet) ?? [],
    datasets: [
      {
        label: "Recipe Distribution",
        data: dashboard?.dietCounts?.map((item) => item.count) ?? [],
      },
    ],
  };

  const scatterData = {
    datasets: [
      {
        label: "Protein vs Carbs",
        data:
          dashboard?.proteinScatter?.map((item) => ({
            x: item.protein,
            y: item.carbs,
          })) ?? [],
      },
    ],
  };

  const scatterOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        title: { display: true, text: "Protein (g)" },
      },
      y: {
        title: { display: true, text: "Carbs (g)" },
      },
    },
  };

  const totalPages = recipes?.pagination?.totalPages || 1;
  const currentPage = recipes?.pagination?.page || 1;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 p-4 text-white">
        <div className="mx-auto max-w-7xl flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Nutritional Insights</h1>
            <p className="text-sm text-blue-100">
              Assignment 3 dashboard wired to your cached Azure Functions APIs
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded bg-blue-500 px-3 py-1">
              Source: {dashboard?.source || "loading"}
            </span>
            <span className="rounded bg-blue-500 px-3 py-1">
              Total Recipes: {dashboard?.totalRecipes ?? 0}
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto p-6">
        {(dashboardError || recipesError || infoMessage) && (
          <section className="mb-8 space-y-3">
            {dashboardError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {dashboardError}
              </div>
            )}
            {recipesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                {recipesError}
              </div>
            )}
            {infoMessage && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-700">
                {infoMessage}
              </div>
            )}
          </section>
        )}

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Explore Nutritional Insights</h2>

          {loadingDashboard && !dashboard ? (
            <div className="rounded-lg bg-white p-6 shadow-lg">Loading charts...</div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white p-4 shadow-lg rounded-lg">
                <h3 className="font-semibold">Bar Chart</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Average macronutrient content by diet type.
                </p>
                <div className="h-56">
                  <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
              </div>

              <div className="bg-white p-4 shadow-lg rounded-lg">
                <h3 className="font-semibold">Scatter Plot</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Nutrient relationships like protein vs carbs.
                </p>
                <div className="h-56">
                  <Scatter data={scatterData} options={scatterOptions} />
                </div>
              </div>

              <div className="bg-white p-4 shadow-lg rounded-lg">
                <h3 className="font-semibold">Heatmap</h3>
                <p className="text-sm text-gray-600 mb-3">Macro intensity by diet type.</p>

                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="font-semibold text-gray-500">Diet</div>
                  <div className="font-semibold text-gray-500">Protein</div>
                  <div className="font-semibold text-gray-500">Carbs</div>
                  <div className="font-semibold text-gray-500">Fat</div>

                  {heatmapRows.map((row) => (
                    <div key={row.diet} className="contents">
                      <div className="rounded p-2 bg-gray-50 font-medium">{row.diet}</div>

                      <div
                        className="rounded p-2 text-center text-white"
                        style={{
                          backgroundColor: `rgba(37, 99, 235, ${normalizeValue(
                            row.protein || 0,
                            maxMacroValue
                          )})`,
                        }}
                      >
                        {formatNumber(row.protein)}
                      </div>

                      <div
                        className="rounded p-2 text-center text-white"
                        style={{
                          backgroundColor: `rgba(22, 163, 74, ${normalizeValue(
                            row.carbs || 0,
                            maxMacroValue
                          )})`,
                        }}
                      >
                        {formatNumber(row.carbs)}
                      </div>

                      <div
                        className="rounded p-2 text-center text-white"
                        style={{
                          backgroundColor: `rgba(147, 51, 234, ${normalizeValue(
                            row.fat || 0,
                            maxMacroValue
                          )})`,
                        }}
                      >
                        {formatNumber(row.fat)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-4 shadow-lg rounded-lg">
                <h3 className="font-semibold">Pie Chart</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Recipe distribution by diet type.
                </p>
                <div className="h-56">
                  <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Filters and Data Interaction</h2>

          <div className="bg-white p-4 shadow-lg rounded-lg">
            <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-4">
              <input
                type="text"
                placeholder="Search by keyword"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                className="p-2 border rounded w-full sm:w-auto flex-1"
              />

              <select
                value={diet}
                onChange={(e) => {
                  setDiet(e.target.value);
                  setPage(1);
                }}
                className="p-2 border rounded w-full sm:w-auto"
              >
                <option value="">All Diet Types</option>
                {dietOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <button type="submit" className="bg-blue-600 text-white py-2 px-4 rounded">
                Apply Filters
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="bg-gray-600 text-white py-2 px-4 rounded"
              >
                Reset
              </button>
            </form>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">API Data Interaction</h2>
          <div className="bg-white p-4 shadow-lg rounded-lg">
            <div className="flex flex-wrap gap-4">
              <button
                className="bg-blue-600 text-white py-2 px-4 rounded"
                onClick={() => fetchDashboard()}
              >
                Get Nutritional Insights
              </button>

              <button
                className="bg-green-600 text-white py-2 px-4 rounded"
                onClick={() => fetchRecipes(diet, keyword, page)}
              >
                Get Recipes
              </button>

              <button
                className="bg-purple-600 text-white py-2 px-4 rounded"
                onClick={() => {
                  setInfoMessage(
                    `Cluster preview — HP/HC: ${clusterSummary.highProteinHighCarb}, HP/LC: ${clusterSummary.highProteinLowCarb}, LP/HC: ${clusterSummary.lowProteinHighCarb}, Balanced: ${clusterSummary.balanced}`
                  );
                }}
              >
                Get Clusters
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg bg-gray-50 p-3 border">
                <p className="text-sm text-gray-600">Cache Source</p>
                <p className="font-semibold">{dashboard?.source || "N/A"}</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3 border">
                <p className="text-sm text-gray-600">Execution Time</p>
                <p className="font-semibold">{dashboard?.executionTime || "N/A"}</p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3 border">
                <p className="text-sm text-gray-600">Generated At</p>
                <p className="font-semibold text-sm">
                  {dashboard?.generatedAt
                    ? new Date(dashboard.generatedAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>

              <div className="rounded-lg bg-gray-50 p-3 border">
                <p className="text-sm text-gray-600">Served At</p>
                <p className="font-semibold text-sm">
                  {dashboard?.servedAt
                    ? new Date(dashboard.servedAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Recipe Results</h2>

          <div className="bg-white p-4 shadow-lg rounded-lg">
            {loadingRecipes && !recipes ? (
              <p className="text-gray-600">Loading recipes...</p>
            ) : (
              <>
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-gray-600">
                    Showing page {recipes?.pagination.page || 1} of{" "}
                    {recipes?.pagination.totalPages || 1}
                  </p>
                  <p className="text-sm text-gray-600">
                    Total matching recipes: {recipes?.pagination.totalItems || 0}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border p-2 text-left">Recipe</th>
                        <th className="border p-2 text-left">Diet</th>
                        <th className="border p-2 text-left">Protein</th>
                        <th className="border p-2 text-left">Carbs</th>
                        <th className="border p-2 text-left">Fat</th>
                        <th className="border p-2 text-left">Cuisine</th>
                        <th className="border p-2 text-left">Calories</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!recipes?.items?.length ? (
                        <tr>
                          <td colSpan={7} className="border p-4 text-center text-gray-600">
                            No recipes found.
                          </td>
                        </tr>
                      ) : (
                        recipes.items.map((item, index) => (
                          <tr key={`${item.recipe || "recipe"}-${index}`} className="bg-white">
                            <td className="border p-2">{item.recipe || "N/A"}</td>
                            <td className="border p-2">{item.diet || "N/A"}</td>
                            <td className="border p-2">{formatNumber(item.protein)}</td>
                            <td className="border p-2">{formatNumber(item.carbs)}</td>
                            <td className="border p-2">{formatNumber(item.fat)}</td>
                            <td className="border p-2">{item.cuisine || "N/A"}</td>
                            <td className="border p-2">{formatNumber(item.calories)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Security & Compliance</h2>
          <div className="bg-white p-4 shadow-lg rounded-lg">
            <h3 className="font-semibold">Security Status</h3>
            <p className="text-sm text-gray-600">
              Encryption: <span className="font-semibold text-green-600">Enabled</span>
            </p>
            <p className="text-sm text-gray-600">
              Access Control: <span className="font-semibold text-green-600">Secure</span>
            </p>
            <p className="text-sm text-gray-600">
              Compliance: <span className="font-semibold text-green-600">Assignment 3 Ready</span>
            </p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">OAuth &amp; 2FA Integration</h2>
          <div className="bg-white p-4 shadow-lg rounded-lg">
            <h3 className="font-semibold">Secure Login</h3>

            <div className="flex flex-wrap gap-3 mb-4">
              <button
                className="bg-blue-600 text-white py-2 px-4 rounded"
                onClick={() =>
                  setInfoMessage(
                    "Wire this button to your future Google OAuth route, like /api/auth/oauth/start?provider=google."
                  )
                }
              >
                Login with Google
              </button>

              <button
                className="bg-gray-800 text-white py-2 px-4 rounded"
                onClick={() =>
                  setInfoMessage(
                    "Wire this button to your future GitHub OAuth route, like /api/auth/oauth/start?provider=github."
                  )
                }
              >
                Login with GitHub
              </button>
            </div>

            <div className="mt-4">
              <label htmlFor="twofa" className="block text-sm text-gray-600 mb-1">
                Enter 2FA Code
              </label>
              <input
                id="twofa"
                type="text"
                className="p-2 border rounded w-full"
                placeholder="Enter your 2FA code"
                onFocus={() =>
                  setInfoMessage("2FA UI is ready. Hook it up after your auth endpoints are done.")
                }
              />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold mb-4">Cloud Resource Cleanup</h2>
          <div className="bg-white p-4 shadow-lg rounded-lg">
            <p className="text-sm text-gray-600">
              Ensure that cloud resources are efficiently managed and cleaned up
              post-deployment.
            </p>
            <button
              className="bg-red-600 text-white py-2 px-4 rounded mt-3"
              onClick={() =>
                setInfoMessage(
                  "Keep this as a demo button unless you build a real cleanup workflow. Do not connect it to destructive actions for the presentation."
                )
              }
            >
              Clean Up Resources
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">Pagination</h2>
          <div className="flex justify-center gap-2 mt-4 flex-wrap">
            <button
              className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .slice(Math.max(0, currentPage - 2), Math.max(0, currentPage - 2) + 5)
              .map((pageNumber) => (
                <button
                  key={pageNumber}
                  className={`px-3 py-1 rounded ${
                    pageNumber === currentPage
                      ? "bg-blue-600 text-white"
                      : "bg-gray-300 hover:bg-gray-400"
                  }`}
                  onClick={() => setPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

            <button
              className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </section>
      </main>

      <footer className="bg-blue-600 p-4 text-white text-center mt-10">
        <p>&copy; 2025 Nutritional Insights. All Rights Reserved.</p>
      </footer>
    </div>
  );
}