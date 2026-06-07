/**
 * GET /api/budgets/suggest?userId=...
 *
 * Returns AI-suggested monthly budgets per category, derived from the
 * user's actual 3-month spending history (no OpenAI call needed).
 * Budgets are set at 90% of the 3-month average, rounded to nearest ₹500,
 * with a ₹1,000 floor. Falls back to smart defaults for unseen categories.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DEFAULTS: Record<string, number> = {
  Food: 6000, Transport: 4000, Shopping: 5000,
  Entertainment: 3000, Health: 3000, Utilities: 4000,
  Education: 3000, Investment: 10000, Other: 3000,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") || null;

  // Last 3 complete months
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  let q = supabase
    .from("transactions")
    .select("amount, category, created_at")
    .gte("created_at", since.toISOString());
  if (userId) q = q.eq("user_id", userId);

  const { data: txns } = await q;

  if (!txns?.length) {
    return NextResponse.json({ budgets: DEFAULTS, source: "default", note: "Not enough history yet — showing smart defaults." });
  }

  // Group spending by month × category
  const monthCat: Record<string, Record<string, number>> = {};
  for (const t of txns) {
    const mo  = t.created_at.slice(0, 7);
    const cat = t.category || "Other";
    if (!monthCat[mo]) monthCat[mo] = {};
    monthCat[mo][cat] = (monthCat[mo][cat] || 0) + Number(t.amount);
  }

  const months   = Object.keys(monthCat);
  const allCats  = new Set(txns.map(t => t.category || "Other"));
  const budgets: Record<string, number> = {};

  for (const cat of allCats) {
    const monthly = months.map(m => monthCat[m][cat] || 0).filter(Boolean);
    if (!monthly.length) { budgets[cat] = DEFAULTS[cat] || 3000; continue; }
    const avg       = monthly.reduce((s, a) => s + a, 0) / monthly.length;
    const stretched = Math.ceil((avg * 0.9) / 500) * 500; // 10% below avg, ceil to ₹500
    budgets[cat]    = Math.max(stretched, 1000);
  }

  // Ensure all standard categories have a value
  for (const [cat, def] of Object.entries(DEFAULTS)) {
    if (!budgets[cat]) budgets[cat] = def;
  }

  const prevMonthLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleString("default", { month: "long", year: "numeric" });

  return NextResponse.json({
    budgets,
    source: "ai",
    basedOnMonths: months.length,
    note: `Based on ${months.length} months of history — set 10% below your average to build savings discipline. Last reference: ${prevMonthLabel}.`,
  });
}
