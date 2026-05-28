import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7); // "2026-05"

  // Fetch all transactions this month
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*, users(phone)")
    .gte("created_at", `${yearMonth}-01`)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const t of transactions) {
    const cat = t.category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
  }

  // Group by day for trend chart
  const byDay: Record<string, number> = {};
  for (const t of transactions) {
    const day = t.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + Number(t.amount);
  }
  const trend = Object.entries(byDay)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Category chart data
  const categoryChart = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // Simple health score
  const savingsRate = total < 50000 ? Math.max(0, 100 - Math.round(total / 500)) : 20;
  const healthScore = Math.min(95, Math.max(30, savingsRate));

  return NextResponse.json({
    total: Math.round(total),
    count: transactions.length,
    healthScore,
    categoryChart,
    trend,
    recent: transactions.slice(0, 10),
    month: now.toLocaleString("default", { month: "long", year: "numeric" }),
  });
}
