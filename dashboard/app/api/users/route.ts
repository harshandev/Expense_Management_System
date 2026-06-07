/**
 * GET /api/users
 * Returns all users who have at least one transaction, with transaction counts.
 * Used by the admin user-picker dropdown in the dashboard.
 */
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const [{ data: users }, { data: txData }] = await Promise.all([
    supabase.from("users").select("id, phone, created_at").order("created_at", { ascending: true }),
    supabase.from("transactions").select("user_id"),
  ]);

  if (!users?.length) return NextResponse.json({ users: [] });

  // Count transactions per user
  const countMap: Record<string, number> = {};
  for (const t of txData || []) {
    countMap[t.user_id] = (countMap[t.user_id] || 0) + 1;
  }

  const enriched = users
    .map(u => ({
      id:    u.id,
      phone: u.phone as string,
      label: u.phone === "web_upload" ? "Web Upload" : String(u.phone),
      count: countMap[u.id] || 0,
    }))
    .filter(u => u.count > 0)
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ users: enriched });
}
