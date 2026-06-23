import { NextRequest, NextResponse } from "next/server";
import { getSession, clearSessionCookie } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (session) {
    // Clear session token in DB so the old cookie is invalidated everywhere
    await supabase
      .from("tenant_users")
      .update({ session_token: null })
      .eq("id", session.user_id);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
