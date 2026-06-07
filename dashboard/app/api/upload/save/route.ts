/**
 * POST /api/upload/save
 *
 * Step 2 of 2 in the upload flow.
 * Receives the (user-reviewed / edited) expense data and persists it to the
 * transactions table. The file is already in Supabase Storage from step 1.
 * Also stores rich metadata (line items, taxes, payment method) and the
 * SHA-256 file hash for future duplicate detection.
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
      metadata:    Record<string, unknown> | null;
      receiptHash: string | null;
    };

    const {
      merchant, amount, category, subcategory, date,
      description, confidence, receiptUrl, fileName,
      metadata, receiptHash,
    } = body;

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
    const insertPayload: Record<string, unknown> = {
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
    };

    // Conditionally add metadata / hash — graceful if columns don't exist yet
    if (metadata)    insertPayload.metadata     = metadata;
    if (receiptHash) insertPayload.receipt_hash = receiptHash;

    const { data: transaction, error: txErr } = await supabase
      .from("transactions")
      .insert(insertPayload)
      .select()
      .single();

    if (txErr) {
      // If the column doesn't exist, retry without the new fields
      if (txErr.code === "42703") {
        const { data: t2, error: e2 } = await supabase
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
        if (e2) throw e2;
        return NextResponse.json({ transaction: t2, migrationPending: true });
      }
      throw txErr;
    }

    return NextResponse.json({ transaction });

  } catch (err) {
    console.error("Upload/save error:", err);
    return NextResponse.json({ error: "Failed to save transaction." }, { status: 500 });
  }
}
