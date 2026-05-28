import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { message, history } = await req.json();

  const now = new Date();
  const yearMonth = now.toISOString().slice(0, 7);

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .gte("created_at", `${yearMonth}-01`)
    .order("created_at", { ascending: false });

  const total = transactions?.reduce((s, t) => s + Number(t.amount), 0) || 0;
  const byCategory: Record<string, number> = {};
  const byMerchant: Record<string, number> = {};
  for (const t of transactions || []) {
    const cat = t.category || "Other";
    byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
    const m = t.merchant || "Unknown";
    byMerchant[m] = (byMerchant[m] || 0) + Number(t.amount);
  }
  const topMerchants = Object.entries(byMerchant).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const systemPrompt = `You are EMSI, a smart AI financial assistant for Indian users. You have access to the user's real expense data.

CURRENT MONTH DATA (${now.toLocaleString("default", { month: "long", year: "numeric" })}):
- Total spent: ₹${total.toFixed(0)}
- Transactions: ${transactions?.length || 0}
- By category: ${Object.entries(byCategory).map(([k, v]) => `${k}: ₹${v.toFixed(0)}`).join(", ")}
- Top merchants: ${topMerchants.map(([k, v]) => `${k}: ₹${v.toFixed(0)}`).join(", ")}
- Recent: ${transactions?.slice(0, 5).map(t => `${t.merchant} ₹${t.amount}`).join(", ")}

RULES:
- Be friendly, conversational, specific
- Always use ₹ for amounts
- Keep replies under 80 words
- Give actionable advice
- Reference their actual data when answering
- You can help with: spending analysis, savings tips, budget advice, expense questions`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(history || []).slice(-6).map((h: { role: string; content: string }) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    })),
    { role: "user" as const, content: message },
  ];

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    stream: true,
    max_tokens: 150,
    temperature: 0.7,
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
