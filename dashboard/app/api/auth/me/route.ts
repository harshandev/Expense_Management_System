import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1-device lock: verify session_token still matches DB
  const { data: user } = await supabase
    .from("tenant_users")
    .select("session_token, name")
    .eq("id", session.user_id)
    .maybeSingle();

  if (!user || user.session_token !== session.session_token) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  return NextResponse.json({
    user_id:   session.user_id,
    tenant_id: session.tenant_id,
    role:      session.role,
    name:      session.name,
  });
}
