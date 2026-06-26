import { NextRequest } from "next/server";
import { getTenantClient } from "@/lib/tenant-supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const supabase = getTenantClient(req);
  if (!supabase) return new Response("Unauthorized", { status: 401 });

  const { message, history } = await req.json();

  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Last 3 months of transactions for rich context
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, merchant, amount, category, subcategory, description, expense_date, created_at, metadata")
    .gte("created_at", threeMonthsAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(200);

  const txns = transactions || [];

  // Current month transactions
  const currMonthTxns = txns.filter(t => t.created_at.startsWith(yearMonth));
  const totalThisMonth = currMonthTxns.reduce((s, t) => s + Number(t.amount), 0);

  // Category breakdown this month
  const byCat: Record<string, number> = {};
  const allTimeByCat: Record<string, number> = {};
  for (const t of currMonthTxns) {
    const c = t.category || "Other";
    byCat[c] = (byCat[c] || 0) + Number(t.amount);
  }
  for (const t of txns) {
    const c = t.category || "Other";
    allTimeByCat[c] = (allTimeByCat[c] || 0) + Number(t.amount);
  }

  // Merchant breakdown this month
  const byMerchant: Record<string, number> = {};
  for (const t of currMonthTxns) {
    const m = t.merchant || "Unknown";
    byMerchant[m] = (byMerchant[m] || 0) + Number(t.amount);
  }
  const topMerchants = Object.entries(byMerchant).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Recent 20 transactions detail
  const recentDetail = txns.slice(0, 20).map(t => {
    const meta = t.metadata as Record<string, unknown> | null;
    const uploader = meta?.uploaded_by ? ` (by ${meta.uploaded_by})` : "";
    const date = (t.expense_date || t.created_at).slice(0, 10);
    return `• ${date} | ${t.merchant} | ₹${t.amount} | ${t.category}${t.subcategory ? "/" + t.subcategory : ""}${uploader}${t.description ? " — " + t.description : ""}`;
  }).join("\n");

  // Category totals for all 3 months
  const allCatSummary = Object.entries(allTimeByCat)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ₹${Math.round(v).toLocaleString("en-IN")}`)
    .join(", ");

  const systemPrompt = `You are EMSI, a sharp and direct AI financial assistant. You have full access to this business's real expense data from the last 3 months. Always answer from the actual data — never make things up or give generic advice.

TODAY: ${now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}

THIS MONTH (${now.toLocaleString("en-IN", { month: "long", year: "numeric" })}):
- Total spent: ₹${Math.round(totalThisMonth).toLocaleString("en-IN")}
- Transactions: ${currMonthTxns.length}
- By category: ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ₹${Math.round(v).toLocaleString("en-IN")}`).join(" | ")}
- Top merchants: ${topMerchants.map(([k,v])=>`${k} ₹${Math.round(v).toLocaleString("en-IN")}`).join(" | ")}

LAST 3 MONTHS (all categories):
${allCatSummary}

RECENT TRANSACTIONS (latest 20):
${recentDetail}

RULES:
- Reference specific merchants, amounts, dates from the data above
- If asked about a merchant/category not in the data, say it clearly
- Use ₹ for all amounts, format in Indian style (e.g. ₹1,23,456)
- Be direct and specific — no filler phrases like "Great question!"
- Keep replies concise but complete (under 120 words)
- If you don't have enough data to answer, say so honestly`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(history || []).slice(-8).map((h: { role: string; content: string }) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user" as const, content: message },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    max_tokens: 300,
    temperature: 0.4,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
