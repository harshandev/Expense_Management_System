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
        return NextResponse.json({ transaction: t2, migrationPending: true, anomaly: null });
      }
      throw txErr;
    }

    // ── Anomaly Detection ────────────────────────────────────────────────
    // Compare this transaction against the user's last 90 days of history
    let anomaly: { level: "high" | "medium" | null; message: string } = { level: null, message: "" };
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const { data: history } = await supabase
        .from("transactions")
        .select("amount, category, merchant")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .neq("id", transaction.id);

      if (history && history.length >= 5) {
        const catTxns   = history.filter(t => t.category === (category || "Other"));
        const catAvg    = catTxns.length > 0
          ? catTxns.reduce((s, t) => s + Number(t.amount), 0) / catTxns.length
          : null;
        const txAmt     = Number(amount);
        const isNew     = !history.some(t => (t.merchant || "").toLowerCase() === merchant.trim().toLowerCase());

        if (catAvg && txAmt > catAvg * 3) {
          anomaly = {
            level: "high",
            message: `₹${txAmt.toLocaleString("en-IN")} is ${Math.round(txAmt / catAvg)}× your usual ${category} spend (avg ₹${Math.round(catAvg).toLocaleString("en-IN")})`,
          };
        } else if (catAvg && txAmt > catAvg * 1.8) {
          anomaly = {
            level: "medium",
            message: `₹${txAmt.toLocaleString("en-IN")} is ${Math.round((txAmt / catAvg - 1) * 100)}% above your avg ${category} spend (₹${Math.round(catAvg).toLocaleString("en-IN")})`,
          };
        } else if (isNew) {
          anomaly = {
            level: "medium",
            message: `First time spending at ${merchant.trim()} in your history`,
          };
        }
      }
    } catch {
      // non-fatal — anomaly detection never blocks a save
    }

    return NextResponse.json({ transaction, anomaly });

  } catch (err) {
    console.error("Upload/save error:", err);
    return NextResponse.json({ error: "Failed to save transaction." }, { status: 500 });
  }
}
