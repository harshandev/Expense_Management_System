import { createHmac, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SECRET  = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const COOKIE  = "sess_tok";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export type SessionPayload = {
  user_id:          string;
  tenant_id:        string;
  role:             "admin" | "viewer";
  session_token:    string;   // mirrors tenant_users.session_token for 1-device lock
  supabase_url:     string;
  supabase_anon_key: string;
  name:             string;
};

function sign(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig  = createHmac("sha256", SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifySession(tok: string): SessionPayload | null {
  try {
    const dot  = tok.lastIndexOf(".");
    if (dot < 0) return null;
    const data = tok.slice(0, dot);
    const sig  = tok.slice(dot + 1);
    const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSession(req: NextRequest): SessionPayload | null {
  const tok = req.cookies.get(COOKIE)?.value;
  if (!tok) return null;
  return verifySession(tok);
}

export function setSessionCookie(res: NextResponse, payload: SessionPayload): void {
  res.cookies.set(COOKIE, sign(payload), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge:   MAX_AGE,
    path:     "/",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const { scryptSync, timingSafeEqual } = require("crypto");
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const attempt = scryptSync(plain, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attempt, "hex"));
  } catch {
    return false;
  }
}
