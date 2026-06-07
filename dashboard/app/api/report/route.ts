/**
 * GET /api/report?month=YYYY-MM&userId=...
 *
 * Generates a personalised monthly financial narrative using GPT-4o.
 * Returns structured sections + 3 concrete action items.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const BUDGETS: Record<string, number> = {
  Food: 6000, Transport: 4000, Shopping: 5000,
  Entertainment: 3000, Health: 3000, Utilities: 4000,
  Education: 3000, Investment: 10000, Other: 3000,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month  = searchParams.get("month");
  const userId = searchParams.get("userId") || null;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month param required (YYYY-MM)" }, { status: 400 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI key not configured" }, { status: 503 });
  }

  const [y, m] = month.split("-").map(Number);
  const pad    = (n: number) => String(n).padStart(2, "0");
  const next   = m === 12 ? `${y+1}-01` : `${y}-${pad(m+1)}`;
  const prev   = m === 1  ? `${y-1}-12` : `${y}-${pad(m-1)}`;

  const makeQ = (from: string, to: string) => {
    let q = supabase.from("transactions").select("*")
      .gte("created_at", `${from}-01`).lt("created_at", `${to}-01`);
    if (userId) q = q.eq("user_id", userId);
    return q;
  };

  const [{ data: curr }, { data: prev_txns }] = await Promise.all([
    makeQ(month, next),
    makeQ(prev, month),
  ]);

  if (!curr?.length) {
    return NextResponse.json({ error: "No transactions found for this month" }, { status: 404 });
  }

  const total     = curr.reduce((s, t) => s + Number(t.amount), 0);
  const prevTotal = prev_txns?.reduce((s, t) => s + Number(t.amount), 0) || 0;
  const momPct    = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0;

  const byCategory: Record<string, number> = {};
  const byMerchant: Record<string, { total: number; count: number }> = {};
  for (const t of curr) {
    const c = t.category || "Other";
    byCategory[c] = (byCategory[c] || 0) + Number(t.amount);
    const merch = t.merchant || "Unknown";
    if (!byMerchant[merch]) byMerchant[merch] = { total: 0, count: 0 };
    byMerchant[merch].total += Number(t.amount);
    byMerchant[merch].count += 1;
  }

  const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([cat, amt]) => {
      const budget = BUDGETS[cat] || 3000;
      const pct    = Math.round((amt / budget) * 100);
      return `${cat}: ₹${Math.round(amt)} / ₹${budget} budget (${pct}%${amt > budget ? " OVER" : ""})`;
    });

  const topMerchants = Object.entries(byMerchant).sort((a, b) => b[1].total - a[1].total).slice(0, 5)
    .map(([name, d]) => `${name}: ₹${Math.round(d.total)} (${d.count} visit${d.count > 1 ? "s" : ""})`);

  const monthLabel = new Date(`${month}-02`).toLocaleString("default", { month: "long", year: "numeric" });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Write a concise personal finance report for an Indian user — ${monthLabel}.

SPENDING DATA:
- Total: ₹${Math.round(total)} | ${curr.length} transactions
- vs Last month: ₹${Math.round(prevTotal)} (${momPct > 0 ? "+" : ""}${momPct}%)
- Avg transaction: ₹${Math.round(total / curr.length)}

CATEGORIES vs BUDGET:
${topCats.join("\n")}

TOP MERCHANTS:
${topMerchants.join("\n")}

Return ONLY valid JSON:
{
  "headline": "one punchy sentence summarising the month with real ₹ numbers",
  "sections": [
    { "heading": "Month Overview", "body": "2-3 sentences covering total, MoM change, notable pattern" },
    { "heading": "Where the Money Went", "body": "2-3 sentences on top categories, any over-budget flags" },
    { "heading": "Merchant Behaviour", "body": "2 sentences on top merchant and what it reveals" },
    { "heading": "vs Last Month", "body": "1-2 sentences on what changed and why it matters" }
  ],
  "actions": [
    "Specific action for next month with a ₹ target",
    "Second specific action with a merchant or category name",
    "Third action — either a savings goal or a habit to build"
  ]
}`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are an Indian personal finance advisor. Output ONLY valid JSON, nothing else." },
      { role: "user",   content: prompt },
    ],
    response_format: { type: "json_object" },
    max_tokens: 900,
  });

  const report = JSON.parse(resp.choices[0].message.content || "{}");

  return NextResponse.json({
    report,
    month,
    monthLabel,
    total:  Math.round(total),
    count:  curr.length,
    momPct,
  });
}
