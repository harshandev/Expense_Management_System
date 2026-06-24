import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isSAAuthenticated } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

const VALID_TIERS = ["basic", "growth", "business", "enterprise"] as const;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSAAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    updates.name = name;
  }

  if (body.tier !== undefined) {
    if (!VALID_TIERS.includes(body.tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }
    updates.tier = body.tier;
  }

  if (body.active !== undefined) {
    updates.active = Boolean(body.active);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", id)
    .select("id, name, slug, tier, active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}
