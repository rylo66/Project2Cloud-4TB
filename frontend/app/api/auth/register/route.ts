import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { readUsers, writeUsers, findUserByEmail, StoredUser } from "@/lib/auth-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const users = await readUsers();

    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash,
      provider: "local",
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    await writeUsers(users);

    return NextResponse.json(
      {
        message: "User registered successfully.",
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          provider: newUser.provider,
          createdAt: newUser.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Registration failed.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}