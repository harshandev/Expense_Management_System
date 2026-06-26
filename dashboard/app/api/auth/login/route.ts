import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  verifyPassword, generateSessionToken,
  setSessionCookie, SessionPayload,
} from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json() as { email: string; password: string };

  if (!email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  // Find user by email in master DB
  const { data: user } = await supabase
    .from("tenant_users")
    .select("id, tenant_id, role, password_hash, name")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Get tenant supabase creds
  const { data: tenant } = await supabase
    .from("tenants")
    .select("supabase_url, supabase_anon_key, name, active")
    .eq("id", user.tenant_id)
    .maybeSingle();

  if (!tenant) {
    return NextResponse.json({ error: "Account not configured" }, { status: 500 });
  }
  if (!tenant.active) {
    return NextResponse.json({ error: "Your account is inactive. Contact your admin." }, { status: 403 });
  }

  // Generate new session token — overwrites any existing session on another device
  const sessionToken = generateSessionToken();

  await supabase
    .from("tenant_users")
    .update({ session_token: sessionToken, last_active: new Date().toISOString() })
    .eq("id", user.id);

  const payload: SessionPayload = {
    user_id:          user.id,
    tenant_id:        user.tenant_id,
    role:             user.role as "admin" | "viewer",
    session_token:    sessionToken,
    supabase_url:     tenant.supabase_url,
    supabase_anon_key: tenant.supabase_anon_key,
    name:             user.name,
    email:            email.trim().toLowerCase(),
  };

  const res = NextResponse.json({ ok: true, role: user.role, name: user.name, tenant: tenant.name });
  setSessionCookie(res, payload);
  return res;
}
