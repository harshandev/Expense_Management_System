import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Returns the best display date for a transaction.
 * WhatsApp AI often extracts wrong historical years (e.g., "yesterday" → 2023).
 * Rule: if expense_date is within 45 days of created_at, trust it; otherwise
 * fall back to created_at so the transaction appears in the correct logged month.
 */
function resolveDate(expenseDate: string | null, createdAt: string): string {
  if (!expenseDate) return createdAt.slice(0, 10);
  const diff = Math.abs(
    new Date(createdAt).getTime() - new Date(expenseDate + "T12:00:00").getTime()
  );
  const days = diff / (1000 * 60 * 60 * 24);
  return days <= 45 ? expenseDate : createdAt.slice(0, 10);
}

const SMART_BUDGETS: Record<string, number> = {
  Food: 6000, Transport: 4000, Shopping: 5000,
  Entertainment: 3000, Health: 3000, Utilities: 4000,
  Education: 3000, Investment: 10000, Other: 3000,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month"); // e.g. "2026-03"

  const now = new Date();
  // Parse selected month or default to current
  let selYear  = now.getFullYear();
  let selMonth = now.getMonth(); // 0-indexed
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    selYear  = y;
    selMonth = m - 1; // convert to 0-indexed
  }
  const selDate   = new Date(selYear, selMonth, 1);
  const yearMonth = selDate.toISOString().slice(0, 7);
  const nextMonth = new Date(selYear, selMonth + 1, 1).toISOString().slice(0, 7);
  const prevStart = new Date(selYear, selMonth - 1, 1).toISOString().slice(0, 7);

  // Filter by created_at (when the transaction was logged) — NOT expense_date.
  // Reason: WhatsApp AI often extracts wrong historical dates (e.g., 2023) from
  // text like "yesterday", making expense_date unreliable for month grouping.
  // Web-upload receipts have correct expense_date but their created_at is also
  // recent, so created_at-based filtering works for both sources.
  const [{ data: curr }, { data: prev }] = await Promise.all([
    supabase.from("transactions").select("*")
      .gte("created_at", `${yearMonth}-01`)
      .lt("created_at",  `${nextMonth}-01`)
      .order("created_at", { ascending: false }),
    supabase.from("transactions").select("*")
      .gte("created_at", `${prevStart}-01`)
      .lt("created_at",  `${yearMonth}-01`),
  ]);

  const transactions = curr || [];
  const previous     = prev || [];

  const total    = transactions.reduce((s, t) => s + Number(t.amount), 0);
  const prevTotal= previous.reduce((s, t) => s + Number(t.amount), 0);

  // By category
  const byCategory: Record<string, number> = {};
  const prevByCategory: Record<string, number> = {};
  for (const t of transactions) {
    const c = t.category || "Other";
    byCategory[c] = (byCategory[c] || 0) + Number(t.amount);
  }
  for (const t of previous) {
    const c = t.category || "Other";
    prevByCategory[c] = (prevByCategory[c] || 0) + Number(t.amount);
  }

  // By merchant
  const byMerchant: Record<string, { total: number; count: number }> = {};
  for (const t of transactions) {
    const m = t.merchant || "Unknown";
    if (!byMerchant[m]) byMerchant[m] = { total: 0, count: 0 };
    byMerchant[m].total += Number(t.amount);
    byMerchant[m].count += 1;
  }
  const topMerchants = Object.entries(byMerchant)
    .map(([name, d]) => ({ name, total: Math.round(d.total), count: d.count, avg: Math.round(d.total / d.count) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  // Daily trend — group by the "display date" (expense_date when reliable, else created_at)
  const byDay: Record<string, number> = {};
  for (const t of transactions) {
    const d = resolveDate(t.expense_date, t.created_at);
    byDay[d] = (byDay[d] || 0) + Number(t.amount);
  }
  const trend = Object.entries(byDay)
    .map(([date, amount]) => ({ date, amount: Math.round(amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Day of week heatmap (0=Sun...6=Sat)
  const byDow: Record<number, number> = { 0:0,1:0,2:0,3:0,4:0,5:0,6:0 };
  for (const t of transactions) {
    const dow = new Date(resolveDate(t.expense_date, t.created_at) + "T12:00:00").getDay();
    byDow[dow] = (byDow[dow] || 0) + Number(t.amount);
  }
  const dowLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const heatmap = Object.entries(byDow).map(([d, amount]) => ({
    day: dowLabels[Number(d)], amount: Math.round(amount),
  }));

  // Category chart + month comparison
  const allCats = Array.from(new Set([...Object.keys(byCategory), ...Object.keys(prevByCategory)]));
  const categoryChart = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  const monthComparison = allCats.map(cat => ({
    category: cat,
    current:  Math.round(byCategory[cat] || 0),
    previous: Math.round(prevByCategory[cat] || 0),
  })).sort((a, b) => b.current - a.current).slice(0, 6);

  // Budget tracker
  const budgetTracker = Object.entries(byCategory).map(([cat, spent]) => {
    const budget = SMART_BUDGETS[cat] || 3000;
    const pct    = Math.min(Math.round((spent / budget) * 100), 150);
    return { category: cat, spent: Math.round(spent), budget, pct, over: spent > budget };
  }).sort((a, b) => b.pct - a.pct);

  // Health score (multi-factor)
  const totalDaysInMonth = new Date(selYear, selMonth + 1, 0).getDate(); // e.g. 31 for May
  const isCurrentMonth   = yearMonth === now.toISOString().slice(0, 7);
  const daysElapsed      = isCurrentMonth ? now.getDate() : totalDaysInMonth;
  // project daily rate × full days in month (not hardcoded 30)
  const projectedTotal   = daysElapsed > 0 ? (total / daysElapsed) * totalDaysInMonth : 0;
  const budgetAdherence  = Math.max(0, 100 - Math.round((budgetTracker.filter(b => b.over).length / Math.max(budgetTracker.length, 1)) * 50));
  const diversity        = Math.min(100, Object.keys(byCategory).length * 15);
  const spendControl     = Math.max(0, Math.min(100, 100 - Math.round((projectedTotal - 20000) / 500)));
  const healthScore      = Math.round((budgetAdherence * 0.4 + diversity * 0.3 + spendControl * 0.3));
  const clampedScore     = Math.min(95, Math.max(25, healthScore));

  // Key metrics
  const amounts      = transactions.map(t => Number(t.amount));
  const maxExpense   = amounts.length ? Math.max(...amounts) : 0;
  const avgExpense   = amounts.length ? Math.round(total / amounts.length) : 0;
  const dailyAvg     = Math.round(daysElapsed > 0 ? total / daysElapsed : 0);
  const projectedEnd = Math.round(projectedTotal);
  const momChange     = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;

  return NextResponse.json({
    total: Math.round(total), count: transactions.length,
    prevTotal: Math.round(prevTotal), momChange,
    healthScore: clampedScore, dailyAvg, projectedEnd,
    maxExpense: Math.round(maxExpense), avgExpense,
    categoryChart, trend, heatmap,
    monthComparison, budgetTracker, topMerchants,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recent: transactions.slice(0, 15).map((t: any) => ({
      id: t.id, merchant: t.merchant, amount: t.amount, category: t.category,
      description: t.description, created_at: t.created_at,
      expense_date: t.expense_date ?? null,
      display_date: resolveDate(t.expense_date, t.created_at), // reliable display date
      receipt_url: t.receipt_url ?? null,
    })),
    month: selDate.toLocaleString("default", { month: "long", year: "numeric" }),
    yearMonth,
    scoreBreakdown: { budgetAdherence, diversity, spendControl },
  });
}
