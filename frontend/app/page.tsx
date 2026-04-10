"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import { Bar, Pie, Scatter } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

const API_BASE = "/api";

type User = {
  id: string;
  email: string;
  name: string;
  provider?: string;
};

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

type AnalyzeResponse = {
  avgMacros: AvgMacro[];
  dietCounts: DietCount[];
  proteinScatter: ProteinPoint[];
  totalRecipes: number;
  executionTime?: string;
  generatedAt?: string;
  servedAt?: string;
  source?: string;
};

type RecipeItem = {
  recipe?: string;
  diet?: string;
  cuisine?: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  [key: string]: unknown;
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
  servedAt?: string;
  source?: string;
};

type AuthMode = "login" | "register";

const emptyRecipes: RecipesResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 1,
  },
  filters: {},
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [dashboard, setDashboard] = useState<AnalyzeResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  const [query, setQuery] = useState("");
  const [diet, setDiet] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [recipes, setRecipes] = useState<RecipesResponse>(emptyRecipes);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState("");

  const dietOptions = useMemo(() => {
    return dashboard?.dietCounts?.map((item) => item.diet).filter(Boolean) ?? [];
  }, [dashboard]);

  async function loadSession() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        setUser(null);
        return;
      }

      const json = await res.json();
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setSessionLoading(false);
    }
  }

  async function loadDashboard() {
    try {
      setDashboardLoading(true);
      setDashboardError("");
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null);
        throw new Error(maybeJson?.error || "Failed to load dashboard analytics.");
      }

      const json = (await res.json()) as AnalyzeResponse;
      setDashboard(json);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : "Failed to load dashboard analytics.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadRecipes(nextPage = page, nextPageSize = pageSize) {
    try {
      setRecipesLoading(true);
      setRecipesError("");

      const params = new URLSearchParams();
      if (diet !== "all") params.set("diet", diet);
      if (query.trim()) params.set("q", query.trim());
      params.set("page", String(nextPage));
      params.set("pageSize", String(nextPageSize));

      const res = await fetch(`${API_BASE}/recipes?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null);
        throw new Error(maybeJson?.error || "Failed to load recipes.");
      }

      const json = (await res.json()) as RecipesResponse;
      setRecipes(json);
    } catch (error) {
      setRecipesError(error instanceof Error ? error.message : "Failed to load recipes.");
      setRecipes(emptyRecipes);
    } finally {
      setRecipesLoading(false);
    }
  }

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDashboard();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadRecipes(page, pageSize);
  }, [user, page, pageSize]);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");

    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const payload =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : {
              name: authForm.name,
              email: authForm.email,
              password: authForm.password,
            };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Authentication failed.");
      }

      setUser(json.user ?? null);
      setAuthForm({ name: "", email: "", password: "" });
      setPage(1);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);

    setUser(null);
    setDashboard(null);
    setRecipes(emptyRecipes);
    setPage(1);
    setQuery("");
    setDiet("all");
  }

  function handleRecipeSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    loadRecipes(1, pageSize);
  }

  const barData = {
    labels: dashboard?.avgMacros.map((item) => item.diet) ?? [],
    datasets: [
      {
        label: "Protein (g)",
        data: dashboard?.avgMacros.map((item) => item.protein) ?? [],
      },
      {
        label: "Carbs (g)",
        data: dashboard?.avgMacros.map((item) => item.carbs) ?? [],
      },
      {
        label: "Fat (g)",
        data: dashboard?.avgMacros.map((item) => item.fat) ?? [],
      },
    ],
  };

  const pieData = {
    labels: dashboard?.dietCounts.map((item) => item.diet) ?? [],
    datasets: [
      {
        label: "Recipe count",
        data: dashboard?.dietCounts.map((item) => item.count) ?? [],
      },
    ],
  };

  const scatterData = {
    datasets: [
      {
        label: "Protein vs Carbs",
        data:
          dashboard?.proteinScatter.map((item) => ({
            x: item.protein,
            y: item.carbs,
          })) ?? [],
      },
    ],
  };

  if (sessionLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 grid place-items-center p-6">
        <div className="rounded-3xl border border-slate-800 bg-slate-900 px-6 py-5 shadow-xl">
          Checking session…
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <p className="mb-3 text-sm uppercase tracking-[0.25em] text-sky-300">
              Assignment 3 / Phase 3
            </p>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
              Cloud Nutrition Dashboard
            </h1>
            <p className="mt-4 max-w-2xl text-slate-300">
              Sign in to view cached analytics, recipe search, diet filters, and pagination.
              This screen is your required auth gate before the dashboard becomes visible.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h2 className="font-semibold">Performance</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Analytics are served from cached chart data instead of recalculating on every request.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h2 className="font-semibold">Security</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Email/password auth plus OAuth live in the same dashboard flow.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <h2 className="font-semibold">Interaction</h2>
                <p className="mt-2 text-sm text-slate-300">
                  Recipes can be filtered by diet type, searched by keyword, and paged through.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
            <div className="mb-6 flex rounded-2xl border border-slate-800 bg-slate-950 p-1">
              <button
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium ${
                  authMode === "login" ? "bg-sky-500 text-slate-950" : "text-slate-300"
                }`}
                onClick={() => setAuthMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-medium ${
                  authMode === "register" ? "bg-sky-500 text-slate-950" : "text-slate-300"
                }`}
                onClick={() => setAuthMode("register")}
                type="button"
              >
                Register
              </button>
            </div>

            <form className="space-y-4" onSubmit={submitAuth}>
              {authMode === "register" && (
                <div>
                  <label className="mb-2 block text-sm text-slate-300">Full name</label>
                  <input
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Riley"
                    required
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-slate-300">Email</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-slate-300">Password</label>
                <input
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="••••••••"
                  required
                />
              </div>

              {authError && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {authError}
                </div>
              )}

              <button
                className="w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
                disabled={authBusy}
                type="submit"
              >
                {authBusy
                  ? authMode === "login"
                    ? "Signing in…"
                    : "Creating account…"
                  : authMode === "login"
                    ? "Login with email"
                    : "Register with email"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-sm text-slate-500">
              <div className="h-px flex-1 bg-slate-800" />
              or
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <a
              className="block w-full rounded-2xl border border-slate-700 px-4 py-3 text-center font-medium text-slate-100 transition hover:border-sky-400"
              href={`${API_BASE}/auth/github/start`}
            >
              Continue with GitHub
            </a>

            <p className="mt-4 text-xs text-slate-500">
              Hook this button to your GitHub OAuth start route so it satisfies the third-party login rubric item.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-sky-300">
              Nutritional Insights Dashboard
            </p>
            <h1 className="text-3xl font-bold">Assignment 3 Secure Analytics</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm">
              Logged in as <span className="font-semibold">{user.name}</span>
            </div>
            <button
              className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950"
              onClick={loadDashboard}
              type="button"
            >
              Refresh analytics
            </button>
            <button
              className="rounded-2xl border border-slate-700 px-4 py-3 font-semibold"
              onClick={handleLogout}
              type="button"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total recipes"
            value={dashboardLoading ? "Loading…" : String(dashboard?.totalRecipes ?? "—")}
            hint="Pulled from cached analytics"
          />
          <StatCard
            label="Execution time"
            value={dashboardLoading ? "Loading…" : dashboard?.executionTime ?? "—"}
            hint="Shows fast cached response"
          />
          <StatCard
            label="Generated at"
            value={
              dashboard?.generatedAt
                ? new Date(dashboard.generatedAt).toLocaleString()
                : dashboardLoading
                  ? "Loading…"
                  : "—"
            }
            hint="When preprocess last rebuilt charts"
          />
          <StatCard
            label="Data source"
            value={dashboardLoading ? "Loading…" : dashboard?.source ?? "—"}
            hint="Should show cache-based serving"
          />
        </section>

        {dashboardError && (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-rose-100">
            {dashboardError}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-3">
          <ChartCard title="Average Macros by Diet" description="Bar chart from cached chart_data.json">
            <Bar data={barData} />
          </ChartCard>
          <ChartCard title="Recipe Count by Diet" description="Pie chart of cleaned recipe totals">
            <Pie data={pieData} />
          </ChartCard>
          <ChartCard title="Protein vs Carbs" description="Scatter plot from precomputed recipe sample">
            <Scatter data={scatterData} />
          </ChartCard>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Recipes</h2>
              <p className="text-sm text-slate-400">
                Search by keyword, filter by diet type, and page through results.
              </p>
            </div>
            <div className="text-sm text-slate-400">
              Source: {recipes.source ?? "—"}
            </div>
          </div>

          <form className="grid gap-4 md:grid-cols-[1.5fr_1fr_auto_auto]" onSubmit={handleRecipeSearch}>
            <input
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              placeholder="Search recipes, cuisine, ingredients…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <select
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              value={diet}
              onChange={(event) => {
                setDiet(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All diet types</option>
              {dietOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none"
              value={pageSize}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPageSize(next);
                setPage(1);
                loadRecipes(1, next);
              }}
            >
              {[5, 10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>

            <button className="rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-slate-950" type="submit">
              Search
            </button>
          </form>

          {recipesError && (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {recipesError}
            </div>
          )}

          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className="bg-slate-950/80 text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Recipe</th>
                    <th className="px-4 py-3 text-left font-medium">Diet</th>
                    <th className="px-4 py-3 text-left font-medium">Cuisine</th>
                    <th className="px-4 py-3 text-left font-medium">Calories</th>
                    <th className="px-4 py-3 text-left font-medium">Protein</th>
                    <th className="px-4 py-3 text-left font-medium">Carbs</th>
                    <th className="px-4 py-3 text-left font-medium">Fat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900">
                  {recipesLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={7}>
                        Loading recipes…
                      </td>
                    </tr>
                  ) : recipes.items.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={7}>
                        No recipes matched your filters.
                      </td>
                    </tr>
                  ) : (
                    recipes.items.map((item, index) => (
                      <tr key={`${item.recipe ?? "recipe"}-${index}`} className="hover:bg-slate-950/60">
                        <td className="px-4 py-3 font-medium text-slate-100">{String(item.recipe ?? "—")}</td>
                        <td className="px-4 py-3 text-slate-300">{String(item.diet ?? "—")}</td>
                        <td className="px-4 py-3 text-slate-300">{String(item.cuisine ?? "—")}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMaybeNumber(item.calories)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMaybeNumber(item.protein)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMaybeNumber(item.carbs)}</td>
                        <td className="px-4 py-3 text-slate-300">{formatMaybeNumber(item.fat)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-400">
              Page {recipes.pagination.page} of {recipes.pagination.totalPages} · {recipes.pagination.totalItems} total results
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
                disabled={recipes.pagination.page <= 1 || recipesLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                Previous
              </button>
              <button
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm disabled:opacity-40"
                disabled={recipes.pagination.page >= recipes.pagination.totalPages || recipesLoading}
                onClick={() =>
                  setPage((current) => Math.min(recipes.pagination.totalPages, current + 1))
                }
                type="button"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-slate-400">{description}</p>
      </div>
      <div className="rounded-2xl bg-white p-4 text-slate-900">{children}</div>
    </div>
  );
}

function formatMaybeNumber(value: unknown) {
  if (typeof value === "number") return value.toFixed(1);
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}
