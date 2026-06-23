import { NextRequest, NextResponse } from "next/server";
import { scryptSync, randomBytes } from "crypto";
import { supabase } from "@/lib/supabase";
import { isSAAuthenticated } from "@/lib/superadmin";
import { TIERS, Tier } from "@/lib/tier-config";

export const dynamic = "force-dynamic";

function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export async function POST(req: NextRequest) {
  if (!isSAAuthenticated(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as {
    name: string;
    slug: string;
    tier: Tier;
    supabase_url: string;
    supabase_anon_key: string;
    supabase_service_key: string;
    whatsapp_numbers: { phone: string; label: string }[];
    admin: { name: string; email: string; password: string };
    viewers: { name: string; email: string; password: string }[];
  };

  const { name, slug, tier, supabase_url, supabase_anon_key, supabase_service_key,
          whatsapp_numbers, admin, viewers } = body;

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
  }
  if (!TIERS[tier]) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  if (!admin?.email || !admin?.password) {
    return NextResponse.json({ error: "Admin email and password are required" }, { status: 400 });
  }

  const tierCfg = TIERS[tier];
  const validWa = whatsapp_numbers.filter(w => w.phone?.trim());
  const validViewers = viewers.filter(v => v.email?.trim() && v.password?.trim());

  if (tierCfg.whatsapp_slots !== -1 && validWa.length > tierCfg.whatsapp_slots) {
    return NextResponse.json(
      { error: `${tierCfg.label} tier allows max ${tierCfg.whatsapp_slots} WhatsApp numbers` },
      { status: 400 }
    );
  }
  if (tierCfg.dashboard_viewers !== -1 && validViewers.length > tierCfg.dashboard_viewers) {
    return NextResponse.json(
      { error: `${tierCfg.label} tier allows max ${tierCfg.dashboard_viewers} viewers` },
      { status: 400 }
    );
  }

  // Create tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .insert({ name: name.trim(), slug: slug.trim(), tier, supabase_url, supabase_anon_key, supabase_service_key })
    .select()
    .single();

  if (tenantErr) {
    const msg = tenantErr.code === "23505"
      ? `Slug "${slug}" is already taken — choose a different one`
      : tenantErr.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Create admin
  const { error: adminErr } = await supabase.from("tenant_users").insert({
    tenant_id: tenant.id,
    role: "admin",
    name: admin.name?.trim() || admin.email,
    email: admin.email.trim().toLowerCase(),
    password_hash: hashPassword(admin.password),
  });
  if (adminErr) {
    await supabase.from("tenants").delete().eq("id", tenant.id);
    return NextResponse.json({ error: "Failed to create admin: " + adminErr.message }, { status: 500 });
  }

  // Create viewers
  for (const v of validViewers) {
    await supabase.from("tenant_users").insert({
      tenant_id: tenant.id,
      role: "viewer",
      name: v.name?.trim() || v.email,
      email: v.email.trim().toLowerCase(),
      password_hash: hashPassword(v.password),
    });
  }

  // Create WhatsApp allowlist
  for (const wa of validWa) {
    await supabase.from("tenant_whatsapp_numbers").insert({
      tenant_id: tenant.id,
      phone: wa.phone.replace(/\D/g, ""),
      label: wa.label?.trim() || null,
    });
  }

  return NextResponse.json({ tenant_id: tenant.id, slug: tenant.slug });
}
