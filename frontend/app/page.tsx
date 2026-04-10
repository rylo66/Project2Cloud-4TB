"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  "https://dietfunc21898.azurewebsites.net/api";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCRIPT_ID = "google-identity-service";

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
  requestedBy?: string;
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

type AuthUser = {
  name: string;
  email: string;
  provider: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, string | number>
          ) => void;
          prompt: () => void;
          cancel?: () => void;
        };
      };
    };
  }
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toFixed(1);
}

function normalizeValue(value: number, max: number) {
  if (!max || max <= 0) return 0.15;
  return Math.max(0.15, value / max);
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `Request failed with status ${response.status}.`;

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error || text;
  } catch {
    return text;
  }
}

export default function Page() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [recipes, setRecipes] = useState<RecipesResponse | null>(null);

  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const [dashboardError, setDashboardError] = useState("");
  const [recipesError, setRecipesError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [diet, setDiet] = useState("");
  const [page, setPage] = useState(1);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [googleButtonReady, setGoogleButtonReady] = useState(false);
  const [googleError, setGoogleError] = useState("");

  const pageSize = 10;

  const clearSession = useCallback((message?: string) => {
    setUser(null);
    setToken("");
    setDashboard(null);
    setRecipes(null);
    setDashboardError("");
    setRecipesError("");
    setKeywordInput("");
    setKeyword("");
    setDiet("");
    setPage(1);
    localStorage.removeItem("diet_token");
    localStorage.removeItem("diet_user");

    if (message) {
      setAuthError(message);
      setInfoMessage("");
    }
  }, []);

  const persistSession = useCallback((nextUser: AuthUser, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    localStorage.setItem("diet_token", nextToken);
    localStorage.setItem("diet_user", JSON.stringify(nextUser));
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearSession("Your session expired. Please sign in again.");
  }, [clearSession]);

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

  const handleGoogleCredential = useCallback(
    async (googleResponse: GoogleCredentialResponse) => {
      if (!googleResponse.credential) {
        setGoogleError("Google did not return a login credential.");
        return;
      }

      try {
        setAuthSubmitting(true);
        setAuthError("");
        setGoogleError("");
        setInfoMessage("");

        const response = await fetch(`${API_BASE}/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ credential: googleResponse.credential }),
        });

        const message = await readErrorMessage(response);
        if (!response.ok) {
          throw new Error(message || "Google sign-in failed.");
        }

        const data = JSON.parse(message) as AuthResponse;
        persistSession(data.user, data.token);
        setAuthMode("login");
        setInfoMessage(`Welcome, ${data.user.name}.`);
        setPage(1);
      } catch (error) {
        console.error(error);
        setGoogleError(error instanceof Error ? error.message : "Google sign-in failed.");
      } finally {
        setAuthSubmitting(false);
      }
    },
    [persistSession]
  );

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      const savedToken = localStorage.getItem("diet_token");
      const savedUser = localStorage.getItem("diet_user");

      if (!savedToken || !savedUser) {
        if (active) setAuthLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const json = (await response.json()) as { user: AuthUser };
        if (!active) return;

        setToken(savedToken);
        setUser(json.user);
        localStorage.setItem("diet_user", JSON.stringify(json.user));
      } catch (error) {
        console.error("Failed to restore saved session", error);
        if (!active) return;
        localStorage.removeItem("diet_token");
        localStorage.removeItem("diet_user");
        setAuthError("Your saved session is no longer valid. Please sign in again.");
      } finally {
        if (active) setAuthLoading(false);
      }
    };

    restoreSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user || !GOOGLE_CLIENT_ID) {
      setGoogleButtonReady(false);
      return;
    }

    let cancelled = false;

    const renderGoogleButton = () => {
      if (cancelled) return;

      const googleId = window.google?.accounts?.id;
      const target = document.getElementById("google-signin-button");
      if (!googleId || !target) return;

      target.innerHTML = "";
      googleId.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      googleId.renderButton(target, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        width: 320,
      });
      setGoogleButtonReady(true);
      setGoogleError("");
    };

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => {
      if (cancelled) return;
      setGoogleError("Could not load Google sign-in. Check your client ID and allowed origins.");
      setGoogleButtonReady(false);
    };

    document.body.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [handleGoogleCredential, user]);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;

    try {
      setLoadingDashboard(true);
      setDashboardError("");

      const response = await fetch(`${API_BASE}/analyze`, {
        cache: "no-store",
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const json: DashboardResponse = await response.json();
      setDashboard(json);
    } catch (error) {
      console.error(error);
      setDashboardError(
        error instanceof Error ? error.message : "Could not load nutritional insights."
      );
    } finally {
      setLoadingDashboard(false);
    }
  }, [handleUnauthorized, token]);

  const fetchRecipes = useCallback(
    async (selectedDiet = diet, selectedKeyword = keyword, selectedPage = page) => {
      if (!token) return;

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

        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const json: RecipesResponse = await response.json();
        setRecipes(json);
      } catch (error) {
        console.error(error);
        setRecipesError(error instanceof Error ? error.message : "Could not load recipes.");
      } finally {
        setLoadingRecipes(false);
      }
    },
    [diet, handleUnauthorized, keyword, page, token]
  );

  useEffect(() => {
    if (!token) return;
    fetchDashboard();
  }, [fetchDashboard, token]);

  useEffect(() => {
    if (!token) return;
    fetchRecipes(diet, keyword, page);
  }, [diet, fetchRecipes, keyword, page, token]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setInfoMessage("");
    setGoogleError("");

    if (authMode === "register" && !nameInput.trim()) {
      setAuthError("Name is required.");
      return;
    }

    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError("Email and password are required.");
      return;
    }

    try {
      setAuthSubmitting(true);

      const route = authMode === "login" ? "auth/login" : "auth/register";
      const payload =
        authMode === "login"
          ? {
              email: emailInput.trim(),
              password: passwordInput,
            }
          : {
              name: nameInput.trim(),
              email: emailInput.trim(),
              password: passwordInput,
            };

      const response = await fetch(`${API_BASE}/${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const data = (await response.json()) as AuthResponse;
      persistSession(data.user, data.token);
      setNameInput("");
      setEmailInput("");
      setPasswordInput("");
      setAuthError("");
      setInfoMessage(`Welcome, ${data.user.name}.`);
      setPage(1);
    } catch (error) {
      console.error(error);
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = () => {
    setInfoMessage("You have been logged out.");
    clearSession();
  };

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Nutritional Insights</h1>
          <p className="text-gray-600">Checking your session...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-semibold text-center mb-2">Nutritional Insights</h1>
          <p className="text-sm text-gray-600 text-center mb-6">
            Please {authMode === "login" ? "log in" : "register"} to access the dashboard.
          </p>

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
              className={`flex-1 rounded px-4 py-2 ${
                authMode === "login"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
              className={`flex-1 rounded px-4 py-2 ${
                authMode === "register"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authMode === "register" && (
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded border p-2"
                  placeholder="Enter your name"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded border p-2"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full rounded border p-2"
                placeholder="Enter your password"
              />
            </div>

            {authError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authSubmitting}
              className="w-full rounded bg-blue-600 text-white py-2 px-4 disabled:opacity-50"
            >
              {authSubmitting
                ? authMode === "login"
                  ? "Logging in..."
                  : "Creating account..."
                : authMode === "login"
                ? "Login"
                : "Create Account"}
            </button>
          </form>

          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="font-semibold mb-2">Google OAuth Login</h2>
            <p className="text-sm text-gray-600 mb-3">
              This project now supports one third-party login provider for Assignment 3.
            </p>

            {!GOOGLE_CLIENT_ID ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                Add <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to your frontend environment to
                enable Google sign-in.
              </div>
            ) : (
              <>
                <div id="google-signin-button" className="min-h-[44px]" />
                {!googleButtonReady && !googleError && (
                  <p className="mt-2 text-sm text-gray-500">Preparing Google sign-in...</p>
                )}
              </>
            )}

            {googleError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {googleError}
              </div>
            )}
          </div>

          {infoMessage && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              {infoMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-600 p-4 text-white">
        <div className="mx-auto max-w-7xl flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Nutritional Insights</h1>
            <p className="text-sm text-blue-100">
              Assignment 3 dashboard with cached Azure Functions and protected data APIs
            </p>
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded bg-blue-500 px-3 py-1">Signed in as: {user.name}</span>
              <span className="rounded bg-blue-500 px-3 py-1">
                Provider: {user.provider}
              </span>
              <span className="rounded bg-blue-500 px-3 py-1">
                Source: {dashboard?.source || "loading"}
              </span>
              <span className="rounded bg-blue-500 px-3 py-1">
                Total Recipes: {dashboard?.totalRecipes ?? 0}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="rounded bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Logout
            </button>
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
                    Showing page {recipes?.pagination.page || 1} of {recipes?.pagination.totalPages || 1}
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
          <h2 className="text-2xl font-semibold mb-4">Security &amp; Compliance</h2>
          <div className="bg-white p-4 shadow-lg rounded-lg space-y-2">
            <p className="text-sm text-gray-600">
              Protected API access: <span className="font-semibold text-green-600">Enabled</span>
            </p>
            <p className="text-sm text-gray-600">
              Supported sign-in methods:{" "}
              <span className="font-semibold text-green-600">Email/Password + Google OAuth</span>
            </p>
            <p className="text-sm text-gray-600">
              Password storage: <span className="font-semibold text-green-600">bcrypt hash only</span>
            </p>
            <p className="text-sm text-gray-600">
              User profile store: <span className="font-semibold text-green-600">Cosmos DB</span>
            </p>
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
        <p>&copy; 2026 Nutritional Insights. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
