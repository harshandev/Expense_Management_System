/**
 * GET /api/search?q=...&userId=...
 *
 * Natural-language transaction search.
 * GPT-4o mini parses the query into structured filters, then we run
 * a Supabase query. Falls back to a basic merchant text search if
 * the OpenAI key is not configured.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q      = (searchParams.get("q") || "").trim();
  const userId = searchParams.get("userId") || null;

  if (!q) return NextResponse.json({ results: [], description: "", filters: null });

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  let filters: {
    merchant:   string | null;
    category:   string | null;
    dateFrom:   string | null;
    dateTo:     string | null;
    amountMin:  number | null;
    amountMax:  number | null;
    description: string;
  } = { merchant: null, category: null, dateFrom: null, dateTo: null, amountMin: null, amountMax: null, description: q };

  // ── AI query parsing ─────────────────────────────────────────────────────
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "your_openai_key_here") {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Today is ${todayStr}. Parse the user's expense search query.
Categories: Food, Transport, Shopping, Entertainment, Health, Utilities, Education, Investment, Other.
"last month" = the calendar month before today. "this month" = current calendar month.
Return ONLY JSON: { "merchant": string|null, "category": string|null, "dateFrom": "YYYY-MM-DD"|null, "dateTo": "YYYY-MM-DD"|null, "amountMin": number|null, "amountMax": number|null, "description": "short human summary of the search" }`,
          },
          { role: "user", content: q },
        ],
        response_format: { type: "json_object" },
        max_tokens: 200,
      });
      filters = { ...filters, ...JSON.parse(res.choices[0].message.content || "{}") };
    } catch {
      // fall back to text-only search
      filters.merchant = q;
    }
  } else {
    // No AI key — do a basic merchant name match
    filters.merchant = q;
  }

  // ── Build DB query ────────────────────────────────────────────────────────
  let dbq = supabase
    .from("transactions")
    .select("id, merchant, amount, category, description, expense_date, created_at, receipt_url, metadata")
    .order("created_at", { ascending: false })
    .limit(60);

  if (userId)            dbq = dbq.eq("user_id", userId);
  if (filters.merchant)  dbq = dbq.ilike("merchant", `%${filters.merchant}%`);
  if (filters.category)  dbq = dbq.eq("category", filters.category);
  if (filters.dateFrom)  dbq = dbq.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo)    dbq = dbq.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters.amountMin) dbq = dbq.gte("amount", filters.amountMin);
  if (filters.amountMax) dbq = dbq.lte("amount", filters.amountMax);

  const { data: results } = await dbq;

  return NextResponse.json({
    results:     results || [],
    description: filters.description || q,
    filters,
    total:       results?.reduce((s, t) => s + Number(t.amount), 0) ?? 0,
  });
}
