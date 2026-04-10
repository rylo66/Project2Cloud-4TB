import { jwtVerify, SignJWT } from "jose";

const secretValue = process.env.AUTH_JWT_SECRET || "dev-secret-change-me";
const secret = new TextEncoder().encode(secretValue);

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};

export async function createSessionToken(user: SessionUser) {
  return await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: String(payload.id),
      name: String(payload.name),
      email: String(payload.email),
    };
  } catch {
    return null;
  }
}