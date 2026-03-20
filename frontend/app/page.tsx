"use client";

import { useEffect, useState } from "react";
import { Bar, Pie, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://dietfunc21898.azurewebsites.net/api/analyze";

type AvgMacro = {
  Diet_type: string;
  "Protein(g)": number;
  "Carbs(g)": number;
  "Fat(g)": number;
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

type ApiResponse = {
  avgMacros: AvgMacro[];
  dietCounts: DietCount[];
  proteinScatter: ProteinPoint[];
  totalRecipes: number;
  executionTime: string;
  generatedAt: string;
};

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const API_URL = "https://dietfunc21898.azurewebsites.net/api/analyze";

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError("");

      const res = await fetch(API_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch dashboard data");

      const json = await res.json();
      setData(json);
    } catch (err) {
      setError("Could not load dashboard data.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) return <main className="p-8">Loading dashboard...</main>;
  if (error || !data) return <main className="p-8">{error}</main>;

  const barData = {
    labels: data.avgMacros.map((item) => item.Diet_type),
    datasets: [
      {
        label: "Protein (g)",
        data: data.avgMacros.map((item) => item["Protein(g)"]),
      },
      {
        label: "Carbs (g)",
        data: data.avgMacros.map((item) => item["Carbs(g)"]),
      },
      {
        label: "Fat (g)",
        data: data.avgMacros.map((item) => item["Fat(g)"]),
      },
    ],
  };

  const pieData = {
    labels: data.dietCounts.map((item) => item.diet),
    datasets: [
      {
        label: "Diet Counts",
        data: data.dietCounts.map((item) => item.count),
      },
    ],
  };

  const scatterData = {
    datasets: [
      {
        label: "Protein vs Carbs",
        data: data.proteinScatter.map((item) => ({
          x: item.protein,
          y: item.carbs,
        })),
      },
    ],
  };

  return (
    <main className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Cloud Nutrition Dashboard</h1>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 border rounded"
        >
          Refresh Data
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded">
          <h2 className="font-semibold">Total Recipes</h2>
          <p>{data.totalRecipes}</p>
        </div>
        <div className="p-4 border rounded">
          <h2 className="font-semibold">Execution Time</h2>
          <p>{data.executionTime}</p>
        </div>
        <div className="p-4 border rounded">
          <h2 className="font-semibold">Last Updated</h2>
          <p>{new Date(data.generatedAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="p-4 border rounded">
        <h2 className="text-xl font-semibold mb-4">Average Macros by Diet</h2>
        <Bar data={barData} />
      </div>

      <div className="p-4 border rounded">
        <h2 className="text-xl font-semibold mb-4">Recipe Count by Diet</h2>
        <Pie data={pieData} />
      </div>

      <div className="p-4 border rounded">
        <h2 className="text-xl font-semibold mb-4">Protein vs Carbs Scatter</h2>
        <Scatter data={scatterData} />
      </div>
    </main>
  );
}
