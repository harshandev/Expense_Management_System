/**
 * POST /api/upload/save
 *
 * Step 2 of 2 in the upload flow.
 * Receives the (user-reviewed / edited) expense data and persists it to the
 * transactions table. The file is already in Supabase Storage from step 1.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const WEB_PHONE = "web_upload";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      merchant:    string;
      amount:      number;
      category:    string;
      subcategory: string;
      date:        string;
      description: string;
      confidence:  number;
      receiptUrl:  string | null;
      fileName:    string;
    };

    const { merchant, amount, category, subcategory, date, description, confidence, receiptUrl, fileName } = body;

    if (!merchant || !amount) {
      return NextResponse.json({ error: "Merchant and amount are required." }, { status: 400 });
    }

    // ── Ensure "web_upload" user exists ────────────────────────────────
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

    // ── Save transaction ────────────────────────────────────────────────
    const { data: transaction, error: txErr } = await supabase
      .from("transactions")
      .insert({
        user_id:      userId,
        merchant:     merchant.trim(),
        amount:       Number(amount),
        category:     category || "Other",
        subcategory:  subcategory || "",
        description:  description || "",
        expense_date: date || new Date().toISOString().slice(0, 10),
        confidence:   Number(confidence) || 1.0,
        currency:     "INR",
        raw_input:    `[web_upload] ${fileName || "receipt"}`.slice(0, 500),
        receipt_url:  receiptUrl ?? null,
      })
      .select()
      .single();

    if (txErr) throw txErr;

    return NextResponse.json({ transaction });

  } catch (err) {
    console.error("Upload/save error:", err);
    return NextResponse.json({ error: "Failed to save transaction." }, { status: 500 });
  }
}
