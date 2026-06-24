import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/tenant-supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const SMART_BUDGETS: Record<string, number> = {
  Food: 6000, Transport: 4000, Shopping: 5000,
  Entertainment: 3000, Health: 3000, Utilities: 4000,
  Education: 3000, Investment: 10000, Other: 3000,
};

const FALLBACK_INSIGHTS = [
  { type: "tip",         icon: "💡", title: "Track daily expenses",    message: "Send receipts via WhatsApp to unlock AI-powered insights based on your real spending patterns." },
  { type: "achievement", icon: "🎉", title: "You're using EMSI!",      message: "Expenses are being tracked. Keep sending receipts to unlock pattern detection and savings suggestions." },
  { type: "prediction",  icon: "📊", title: "Insights coming soon",    message: "As more transactions are added, AI will flag wasteful spending and suggest targeted savings opportunities." },
  { type: "warning",     icon: "⚠️", title: "Connect OpenAI key",      message: "Add your OpenAI API key in .env.local to enable live, personalised AI-generated financial insights." },
];

export async function GET(req: NextRequest) {
  const supabase = getTenantClient(req);
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_key_here") {
    return NextResponse.json({ insights: FALLBACK_INSIGHTS });
  }

  const { searchParams } = new URL(req.url);
  const lang   = searchParams.get("lang") === "hi" ? "hi" : "en";
  const userId = searchParams.get("userId") || null;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const now = new Date();

    // Timezone-safe month strings (no toISOString() UTC-shift)
    const pad = (n: number) => String(n).padStart(2, "0");
    const yearMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const [prevYear, prevMon] = now.getMonth() === 0
      ? [now.getFullYear() - 1, 12]
      : [now.getFullYear(), now.getMonth()];
    const prevMonth = `${prevYear}-${pad(prevMon)}`;

    const daysElapsed      = now.getDate();
    const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const baseQuery = (start: string, end?: string) => {
      let q = supabase.from("transactions").select("*").gte("created_at", start);
      if (end) q = q.lt("created_at", end);
      if (userId) q = q.eq("user_id", userId);
      return q;
    };

    const [{ data: current }, { data: previous }] = await Promise.all([
      baseQuery(`${yearMonth}-01`),
      baseQuery(`${prevMonth}-01`, `${yearMonth}-01`),
    ]);

    if (!current?.length) {
      return NextResponse.json({
        insights: [{
          type: "tip", icon: "💡", title: "Start tracking expenses",
          message: "Send your first receipt on WhatsApp to unlock AI-powered personalised spending insights.",
        }],
      });
    }

    const totalCurrent  = current.reduce((s, t) => s + Number(t.amount), 0);
    const totalPrevious = previous?.reduce((s, t) => s + Number(t.amount), 0) || 0;
    const momPct        = totalPrevious > 0
      ? Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100) : 0;
    const dailyAvg   = daysElapsed > 0 ? totalCurrent / daysElapsed : 0;
    const projected  = dailyAvg * totalDaysInMonth;

    // ── Category breakdown vs budget ─────────────────────────────────────
    const byCategory: Record<string, number> = {};
    for (const t of current) {
      const c = t.category || "Other";
      byCategory[c] = (byCategory[c] || 0) + Number(t.amount);
    }
    const categoryAnalysis = Object.entries(byCategory)
      .map(([name, spent]) => {
        const budget = SMART_BUDGETS[name] || 3000;
        const pct    = Math.round((spent / budget) * 100);
        return { name, spent: Math.round(spent), budget, pct, over: spent > budget };
      })
      .sort((a, b) => b.pct - a.pct);

    // ── Top merchants ─────────────────────────────────────────────────────
    const byMerchant: Record<string, { total: number; count: number }> = {};
    for (const t of current) {
      const m = t.merchant || "Unknown";
      if (!byMerchant[m]) byMerchant[m] = { total: 0, count: 0 };
      byMerchant[m].total += Number(t.amount);
      byMerchant[m].count += 1;
    }
    const topMerchants = Object.entries(byMerchant)
      .map(([name, d]) => ({
        name, total: Math.round(d.total), count: d.count,
        avg: Math.round(d.total / d.count),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── Top individual transactions ───────────────────────────────────────
    const topTx = [...current]
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 3)
      .map(t => ({ merchant: t.merchant, amount: Math.round(Number(t.amount)), category: t.category }));

    const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });
    const isHindi = lang === "hi";

    const prompt = isHindi ? `
${monthLabel} के लिए इस भारतीय उपयोगकर्ता का वास्तविक खर्च विश्लेषण करें:

सारांश:
- इस महीने: ₹${Math.round(totalCurrent)}, ${current.length} लेनदेन (${daysElapsed}/${totalDaysInMonth} दिन)
- पिछले महीने: ₹${Math.round(totalPrevious)} — बदलाव: ${momPct > 0 ? "+" : ""}${momPct}%
- दैनिक औसत: ₹${Math.round(dailyAvg)} → अनुमानित माह-अंत: ₹${Math.round(projected)}

श्रेणी बनाम बजट:
${categoryAnalysis.map(c => `- ${c.name}: खर्च ₹${c.spent} / बजट ₹${c.budget} (${c.pct}%${c.over ? " — बजट से अधिक" : ""})`).join("\n")}

शीर्ष दुकानें:
${topMerchants.map(m => `- ${m.name}: ₹${m.total} · ${m.count} बार · औसत ₹${m.avg}`).join("\n")}

सबसे बड़े खर्च:
${topTx.map(t => `- ${t.merchant}: ₹${t.amount} (${t.category})`).join("\n")}

ठीक 4 insights बनाएं (एक-एक: warning, tip, achievement, prediction)।
नियम:
- असली merchant नाम, ₹ राशि और प्रतिशत का उपयोग करें
- actionable सुझाव दें — उपयोगकर्ता को बताएं क्या करना है
- message अधिकतम 35 शब्द, title अधिकतम 6 शब्द
- सभी title और message हिंदी में लिखें

केवल valid JSON लौटाएं (कोई markdown नहीं):
{"insights":[{"type":"warning","icon":"emoji","title":"≤6 शब्द","message":"≤35 शब्द असली संख्या के साथ"},{"type":"tip",...},{"type":"achievement",...},{"type":"prediction",...}]}`
    : `
Analyze this Indian user's real spending for ${monthLabel}:

OVERVIEW:
- This month: ₹${Math.round(totalCurrent)} across ${current.length} transactions (${daysElapsed}/${totalDaysInMonth} days elapsed)
- Last month: ₹${Math.round(totalPrevious)} — month-on-month change: ${momPct > 0 ? "+" : ""}${momPct}%
- Daily average: ₹${Math.round(dailyAvg)} → projected month-end: ₹${Math.round(projected)}

CATEGORIES vs SMART BUDGET:
${categoryAnalysis.map(c => `- ${c.name}: spent ₹${c.spent} / budget ₹${c.budget} (${c.pct}%${c.over ? " — OVER BUDGET" : ""})`).join("\n")}

TOP MERCHANTS:
${topMerchants.map(m => `- ${m.name}: ₹${m.total} · ${m.count} visit${m.count > 1 ? "s" : ""} · avg ₹${m.avg}`).join("\n")}

BIGGEST TRANSACTIONS:
${topTx.map(t => `- ${t.merchant}: ₹${t.amount} (${t.category})`).join("\n")}

Generate EXACTLY 4 insights (one of each type: warning, tip, achievement, prediction).
RULES:
- MUST cite specific merchant names, ₹ amounts, and percentages from the data above
- Be actionable: tell the user EXACTLY what to do or what will happen
- Max 35 words per message
- Titles max 6 words

Return ONLY valid JSON (no markdown, no explanation):
{"insights":[{"type":"warning","icon":"emoji","title":"≤6 words","message":"≤35 words with real numbers"},{"type":"tip",...},{"type":"achievement",...},{"type":"prediction",...}]}`;

    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 12000);

    const systemMsg = isHindi
      ? "आप एक भारतीय व्यक्तिगत वित्त AI हैं। केवल valid JSON आउटपुट करें, और कुछ नहीं।"
      : "You are an Indian personal finance AI. Output ONLY valid JSON, nothing else.";

    const response = await openai.chat.completions.create({
      model:   "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user",   content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 700,
    });

    clearTimeout(timeout);
    const result = JSON.parse(response.choices[0].message.content || "{}");
    return NextResponse.json({ insights: result.insights || FALLBACK_INSIGHTS });

  } catch (err) {
    console.error("Insights API error:", err);
    return NextResponse.json({ insights: FALLBACK_INSIGHTS });
  }
}
