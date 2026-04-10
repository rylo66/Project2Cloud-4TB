import { NextResponse } from "next/server";

const PYTHON_API_BASE_URL =
  process.env.PYTHON_API_BASE_URL || "http://localhost:7071/api";

export async function GET() {
  try {
    const response = await fetch(`${PYTHON_API_BASE_URL}/analyze`, {
      cache: "no-store",
    });

    const text = await response.text();

    return new NextResponse(text, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to reach backend analyze endpoint.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}