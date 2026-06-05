import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const VALID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const SYSTEM_PROMPT = `You are an AI expense extraction assistant for an Indian expense tracking app.

Extract expense information and return ONLY a valid JSON object with these fields:
- is_expense: boolean (true if this contains expense info)
- merchant: string (merchant/store/restaurant name)
- amount: number (rupees, numeric only, no symbols)
- category: string (exactly one of: Food, Transport, Shopping, Entertainment, Health, Utilities, Education, Investment, Other)
- subcategory: string (specific e.g. "Food Delivery", "Groceries", "Petrol", "Movie")
- date: string (YYYY-MM-DD format, use today's date if not found)
- description: string (one line summary)
- confidence: number (0.0 to 1.0)
- currency: string (default "INR")

Indian context: UPI payments, Swiggy/Zomato/Amazon/Zepto/Blinkit are common. Amounts in ₹ or Rs.
Return ONLY valid JSON. No explanation, no markdown, no code blocks.`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const bytes  = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mime   = file.type || "application/octet-stream";

    // ── Step 1: Extract expense with AI ─────────────────────────────────
    let expense: Record<string, unknown>;

    if (VALID_IMAGE_TYPES.has(mime)) {
      // GPT-4o Vision for images
      const base64 = buffer.toString("base64");
      const result = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64}`, detail: "high" } },
          ],
        }],
        response_format: { type: "json_object" },
        max_tokens: 500,
      });
      expense = JSON.parse(result.choices[0].message.content || "{}");

    } else if (mime === "application/pdf") {
      // pdf-parse for text PDFs — import the lib directly to avoid test-file issue
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
        buf: Buffer
      ) => Promise<{ text: string; numpages: number }>;

      const pdfData = await pdfParse(buffer);
      const text    = pdfData.text?.trim() || "";

      if (text.length < 80) {
        return NextResponse.json({
          error: "This looks like a scanned PDF. For scanned documents, send via WhatsApp for full AI vision processing.",
        }, { status: 422 });
      }

      const result = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `[PDF Receipt – ${pdfData.numpages} page(s)]\n${text.slice(0, 6000)}` },
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
      });
      expense = JSON.parse(result.choices[0].message.content || "{}");

    } else {
      return NextResponse.json({
        error: "Unsupported file type. Upload a JPEG, PNG, WebP, or PDF receipt.",
      }, { status: 400 });
    }

    if (!expense.is_expense) {
      return NextResponse.json({
        error: "No expense detected in this file. Try a clearer image of a receipt or invoice.",
      }, { status: 422 });
    }

    // ── Step 2: Upload to Supabase Storage ──────────────────────────────
    const ext      = mime.includes("pdf") ? "pdf" : mime.split("/")[1] || "jpg";
    const fileName = `web/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    let receiptUrl: string | null = null;

    const { error: storageErr } = await supabase.storage
      .from("receipts")
      .upload(fileName, buffer, { contentType: mime, upsert: false });

    if (!storageErr) {
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);
      receiptUrl = urlData?.publicUrl ?? null;
    }
    // (Storage failure is non-fatal — expense still saves without a thumbnail)

    // ── Step 3: Ensure "web_upload" user exists ─────────────────────────
    const WEB_PHONE = "web_upload";
    let userId: string;
    const { data: existing } = await supabase
      .from("users").select("id").eq("phone", WEB_PHONE).maybeSingle();

    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("users").insert({ phone: WEB_PHONE }).select("id").single();
      if (createErr) throw createErr;
      userId = created.id;
    }

    // ── Step 4: Save transaction ─────────────────────────────────────────
    const { data: transaction, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id:      userId,
        merchant:     String(expense.merchant  || "Unknown"),
        amount:       Number(expense.amount)   || 0,
        category:     String(expense.category  || "Other"),
        subcategory:  String(expense.subcategory || ""),
        description:  String(expense.description || ""),
        expense_date: String(expense.date || new Date().toISOString().slice(0, 10)),
        confidence:   Number(expense.confidence) || 1.0,
        currency:     String(expense.currency || "INR"),
        raw_input:    `[web_upload] ${file.name}`.slice(0, 500),
        receipt_url:  receiptUrl,
      })
      .select()
      .single();

    if (txErr) throw txErr;

    return NextResponse.json({ expense, transaction, receiptUrl });

  } catch (err) {
    console.error("Upload route error:", err);
    return NextResponse.json({ error: "Processing failed. Please try again." }, { status: 500 });
  }
}
