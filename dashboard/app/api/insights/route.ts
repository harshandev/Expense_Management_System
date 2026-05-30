import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// Fallback insights if OpenAI key missing or request fails
const FALLBACK_INSIGHTS = [
  { type: "tip",         icon: "💡", title: "Track daily expenses",       message: "Send receipts via WhatsApp to get personalized AI insights based on your real spending patterns." },
  { type: "achievement", icon: "🎉", title: "You're using EMSI!",         message: "Your expenses are being tracked automatically. Keep sending receipts to unlock deeper insights." },
  { type: "prediction",  icon: "📊", title: "Insights coming soon",       message: "As you add more transactions, AI will detect patterns, flag wasteful spending, and suggest savings." },
  { type: "warning",     icon: "⚠️", title: "Connect your OpenAI key",    message: "Add your OpenAI API key in .env.local to enable live AI-generated financial insights." },
];

export async function GET() {
  // Guard: no API key → return fallback immediately
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_key_here") {
    return NextResponse.json({ insights: FALLBACK_INSIGHTS });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const now = new Date();
    const yearMonth  = now.toISOString().slice(0, 7);
    const prevMonth  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);

    const [{ data: current }, { data: previous }] = await Promise.all([
      supabase.from("transactions").select("*").gte("created_at", `${yearMonth}-01`),
      supabase.from("transactions").select("*")
        .gte("created_at", `${prevMonth}-01`)
        .lt("created_at",  `${yearMonth}-01`),
    ]);

    if (!current?.length) {
      return NextResponse.json({
        insights: [
          { type: "tip", icon: "💡", title: "Start tracking expenses",
            message: "Send your first receipt on WhatsApp to unlock AI-powered spending insights." },
        ],
      });
    }

    const totalCurrent  = current.reduce((s, t) => s + Number(t.amount), 0);
    const totalPrevious = previous?.reduce((s, t) => s + Number(t.amount), 0) || 0;

    const byCategory: Record<string, number> = {};
    const byMerchant:  Record<string, number> = {};
    for (const t of current) {
      const cat = t.category || "Other";
      byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
      const m = t.merchant || "Unknown";
      byMerchant[m]   = (byMerchant[m]   || 0) + Number(t.amount);
    }

    const topMerchant       = Object.entries(byMerchant).sort((a, b) => b[1] - a[1])[0];
    const dailyAvg          = totalCurrent / now.getDate();
    const projectedMonthly  = dailyAvg * 30;

    const prompt = `
Analyze this Indian user's spending for ${now.toLocaleString("default", { month: "long", year: "numeric" })}:
- Total: ₹${totalCurrent.toFixed(0)} (prev month: ₹${totalPrevious.toFixed(0)})
- Transactions: ${current.length}
- Categories: ${Object.entries(byCategory).map(([k, v]) => `${k}: ₹${v.toFixed(0)}`).join(", ")}
- Top merchant: ${topMerchant?.[0]} (₹${topMerchant?.[1]?.toFixed(0)})
- Daily avg: ₹${dailyAvg.toFixed(0)}, projected: ₹${projectedMonthly.toFixed(0)}/month

Return JSON: { "insights": [ ...4 items... ] }
Each: { "type": "warning"|"tip"|"achievement"|"prediction", "icon": emoji, "title": "≤6 words", "message": "specific, use ₹, ≤25 words" }
Be specific with real numbers. Indian context.`;

    // 10-second timeout so UI never hangs
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 10000);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an Indian personal finance AI. Return only valid JSON." },
        { role: "user",   content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    clearTimeout(timeout);
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return NextResponse.json({ insights: result.insights || FALLBACK_INSIGHTS });

  } catch (err) {
    console.error("Insights API error:", err);
    return NextResponse.json({ insights: FALLBACK_INSIGHTS });
  }
}
