import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isSAAuthenticated } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isSAAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, slug, tier, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tenants?.length) return NextResponse.json({ tenants: [] });

  const ids = tenants.map(t => t.id);

  const [{ data: users }, { data: waNumbers }] = await Promise.all([
    supabase.from("tenant_users").select("tenant_id").in("tenant_id", ids),
    supabase.from("tenant_whatsapp_numbers").select("tenant_id").in("tenant_id", ids).eq("active", true),
  ]);

  const userCount  = (id: string) => (users  ?? []).filter(u => u.tenant_id === id).length;
  const waCount    = (id: string) => (waNumbers ?? []).filter(w => w.tenant_id === id).length;

  return NextResponse.json({
    tenants: tenants.map(t => ({
      ...t,
      user_count: userCount(t.id),
      wa_count:   waCount(t.id),
    })),
  });
}
