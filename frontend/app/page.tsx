"use client";


import { useMemo, useState } from "react";
import {
  Bar,
  Pie,
  Scatter,
} from "react-chartjs-2";
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


const avgMacrosMock: AvgMacro[] = [
  { Diet_type: "Keto", "Protein(g)": 32, "Carbs(g)": 12, "Fat(g)": 41 },
  { Diet_type: "Vegan", "Protein(g)": 18, "Carbs(g)": 46, "Fat(g)": 14 },
  { Diet_type: "Mediterranean", "Protein(g)": 24, "Carbs(g)": 35, "Fat(g)": 22 },
  { Diet_type: "High-Protein", "Protein(g)": 39, "Carbs(g)": 28, "Fat(g)": 18 },
];


const dietCountsMock: DietCount[] = [
  { diet: "Keto", count: 14 },
  { diet: "Vegan", count: 20 },
  { diet: "Mediterranean", count: 17 },
  { diet: "High-Protein", count: 11 },
];


const proteinScatterMock: ProteinPoint[] = [
  { recipe: "Grilled Chicken Bowl", diet: "High-Protein", protein: 42, carbs: 21 },
  { recipe: "Tofu Stir Fry", diet: "Vegan", protein: 24, carbs: 30 },
  { recipe: "Avocado Egg Plate", diet: "Keto", protein: 28, carbs: 10 },
  { recipe: "Salmon Quinoa Salad", diet: "Mediterranean", protein: 31, carbs: 26 },
  { recipe: "Greek Yogurt Mix", diet: "High-Protein", protein: 36, carbs: 18 },
  { recipe: "Chickpea Curry", diet: "Vegan", protein: 19, carbs: 41 },
  { recipe: "Zucchini Beef Skillet", diet: "Keto", protein: 34, carbs: 9 },
  { recipe: "Falafel Bowl", diet: "Mediterranean", protein: 22, carbs: 37 },
];


export default function Home() {
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
  const [executionTime, setExecutionTime] = useState("0.42s");


  const totalRecipes = useMemo(
    () => dietCountsMock.reduce((sum, item) => sum + item.count, 0),
    []
  );


  const refreshDashboard = () => {
    setLastUpdated(new Date().toLocaleString());
    setExecutionTime(`${(Math.random() * 0.8 + 0.2).toFixed(2)}s`);
  };


  const barData = {
    labels: avgMacrosMock.map((item) => item.Diet_type),
    datasets: [
      {
        label: "Protein (g)",
        data: avgMacrosMock.map((item) => item["Protein(g)"]),
      },
      {
        label: "Carbs (g)",
        data: avgMacrosMock.map((item) => item["Carbs(g)"]),
      },
      {
        label: "Fat (g)",
        data: avgMacrosMock.map((item) => item["Fat(g)"]),
      },
    ],
  };


  const pieData = {
    labels: dietCountsMock.map((item) => item.diet),
    datasets: [
      {
        label: "Recipes",
        data: dietCountsMock.map((item) => item.count),
      },
    ],
  };


  const scatterData = {
    datasets: [
      {
        label: "Protein vs Carbs",
        data: proteinScatterMock.map((item) => ({
          x: item.carbs,
          y: item.protein,
        })),
      },
    ],
  };


  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Phase 2 Cloud Dashboard
              </p>
              <h1 className="mt-2 text-3xl font-bold text-slate-900 md:text-4xl">
                Diet Analysis Dashboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                This dashboard shows nutrition insights from the All_Diets dataset,
                including average macronutrients, recipe distribution by diet type,
                and protein vs carbs comparisons.
              </p>
            </div>


            <button
              onClick={refreshDashboard}
              className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              Refresh Dashboard
            </button>
          </div>
        </section>


        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Total Recipes</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              {totalRecipes}
            </h2>
          </div>


          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Last Updated</p>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {lastUpdated}
            </h2>
          </div>


          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Function Execution Time</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">
              {executionTime}
            </h2>
          </div>
        </section>


        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-900">
                Average Macronutrients by Diet Type
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Compare average protein, carbs, and fat across diet categories.
              </p>
            </div>
            <div className="h-[360px]">
              <Bar
                data={barData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: "top" },
                    title: { display: false },
                  },
                }}
              />
            </div>
          </div>


          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h3 className="text-xl font-semibold text-slate-900">
                Recipe Distribution by Diet Type
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Shows how many recipes belong to each diet type.
              </p>
            </div>
            <div className="h-[360px]">
              <Pie
                data={pieData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: "bottom" },
                  },
                }}
              />
            </div>
          </div>
        </section>


        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h3 className="text-xl font-semibold text-slate-900">
              Protein vs Carbs by Recipe
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Higher points mean more protein. Further right means more carbs.
            </p>
          </div>


          <div className="h-[400px]">
            <Scatter
              data={scatterData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  x: {
                    title: {
                      display: true,
                      text: "Carbs (g)",
                    },
                  },
                  y: {
                    title: {
                      display: true,
                      text: "Protein (g)",
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: true,
                    position: "top",
                  },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const point = proteinScatterMock[context.dataIndex];
                        return `${point.recipe} | ${point.diet} | Protein: ${point.protein}g, Carbs: ${point.carbs}g`;
                      },
                    },
                  },
                },
              }}
            />
          </div>
        </section>


        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h3 className="text-xl font-semibold text-slate-900">
            Dashboard Notes
          </h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Current data source
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Mock data for frontend development. Next step is replacing this
                with live data from your Azure Function API.
              </p>
            </div>


            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Next integration step
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Use fetch in this page to call your <code>/api/analyze</code>{" "}
                endpoint and populate the charts dynamically.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
