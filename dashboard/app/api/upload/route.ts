/**
 * POST /api/upload
 *
 * Step 1 of 2 in the upload flow.
 * Extracts expense data from the uploaded file using AI + uploads the file
 * to Supabase Storage for the receipt thumbnail.
 *
 * Does NOT write to the transactions table — that happens in /api/upload/save
 * after the user reviews and edits the extracted data.
 */
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

    // ── AI Extraction ────────────────────────────────────────────────────
    let expense: Record<string, unknown>;

    if (VALID_IMAGE_TYPES.has(mime)) {
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
      // pdf-parse v2: class-based API — no test-file loading side-effects
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as {
        PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string; total: number }> }
      };

      const parser  = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
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
          { role: "user",   content: `[PDF Receipt – ${pdfData.total} page(s)]\n${text.slice(0, 6000)}` },
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

    // ── Upload file to Supabase Storage (for receipt thumbnail) ─────────
    const ext      = mime.includes("pdf") ? "pdf" : (mime.split("/")[1] || "jpg");
    const fileName = `web/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    let receiptUrl: string | null = null;

    const { error: storageErr } = await supabase.storage
      .from("receipts")
      .upload(fileName, buffer, { contentType: mime, upsert: false });

    if (!storageErr) {
      const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(fileName);
      receiptUrl = urlData?.publicUrl ?? null;
    }
    // Non-fatal: user can still review & save without a thumbnail

    // Return extracted data + receipt URL — NO DB write yet
    return NextResponse.json({
      expense,
      receiptUrl,
      fileName: file.name,
    });

  } catch (err) {
    console.error("Upload/extract error:", err);
    return NextResponse.json({ error: "Processing failed. Please try again." }, { status: 500 });
  }
}
