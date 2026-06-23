from datetime import datetime
from supabase import Client
from app.services.extractor import extract_from_image, extract_from_text, extract_from_pdf, transcribe_from_audio
from app.services.whatsapp import format_expense_reply
from app.services.database import (
    get_tenant_by_phone, make_tenant_client,
    get_or_create_user, save_transaction, get_monthly_summary,
    is_duplicate, get_user_name, set_user_name,
)
from app.config import settings

GREETING_KEYWORDS = {"hi", "hello", "hey", "start", "help"}
SUMMARY_KEYWORDS  = {"summary", "report", "spending", "total", "how much"}

# Keyed by (tenant_id, phone) — avoids cross-tenant name-capture collisions.
# Resets on server restart; good enough since this is a transient 1-turn state.
_awaiting_name: dict[tuple[str, str], bool] = {}

CATEGORY_EMOJI = {
    "Food": "🍔", "Transport": "🚗", "Shopping": "🛍",
    "Entertainment": "🎬", "Health": "💊", "Utilities": "⚡",
    "Education": "📚", "Investment": "📈", "Other": "📦",
}

NOT_REGISTERED = (
    "❌ *Your number isn't registered.*\n\n"
    "Please contact your company admin to get access."
)


async def route_message(
    from_number: str,
    body: str,
    num_media: int,
    media_url: str,
    media_content_type: str,
) -> str:
    # Normalize phone: "whatsapp:+919876543210" → "919876543210"
    phone = from_number.removeprefix("whatsapp:+").removeprefix("+")

    # Resolve tenant — if not registered, reject immediately
    tenant = await get_tenant_by_phone(phone)
    if not tenant:
        return NOT_REGISTERED

    client: Client = make_tenant_client(tenant["supabase_url"], tenant["supabase_service_key"])
    state_key = (tenant["tenant_id"], phone)
    body_lower = body.strip().lower()

    # ── Name capture ───────────────────────────────────────────────────────
    if _awaiting_name.get(state_key) and num_media == 0 and body.strip():
        name = body.strip().title()
        await set_user_name(client, phone, name)
        _awaiting_name.pop(state_key, None)
        return (
            f"Nice to meet you, *{name}*! 🎉\n\n"
            "You're all set. Send me:\n"
            "📸 A receipt photo\n"
            "🎤 A voice note with your expense\n"
            "💬 A text like _'spent 250 on lunch'_\n\n"
            "I'll track everything automatically!"
        )

    # ── Greeting ───────────────────────────────────────────────────────────
    if body_lower in GREETING_KEYWORDS:
        existing_name = await get_user_name(client, phone)
        if existing_name:
            return (
                f"👋 Welcome back, *{existing_name}*!\n\n"
                "Send me a receipt, voice note, or type an expense — I'll track it instantly.\n\n"
                "Say *summary* to see your monthly report."
            )
        _awaiting_name[state_key] = True
        return (
            "👋 *Welcome to EMSI!*\n"
            "_Expense Management System Intelligence_\n\n"
            "I'm your AI finance assistant. Before we start — *what should I call you?*\n\n"
            "_Just reply with your name_ 😊"
        )

    # ── Monthly summary ────────────────────────────────────────────────────
    if any(kw in body_lower for kw in SUMMARY_KEYWORDS):
        return await handle_summary(client, phone)

    auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    # ── Image receipt ──────────────────────────────────────────────────────
    if num_media > 0 and "image" in media_content_type:
        expense = await extract_from_image(media_url, auth)
        return await handle_expense(client, phone, expense, raw_input="[image]")

    # ── PDF receipt ────────────────────────────────────────────────────────
    if num_media > 0 and "pdf" in media_content_type:
        expense = await extract_from_pdf(media_url, auth)
        return await handle_expense(client, phone, expense, raw_input="[pdf]")

    # ── Voice note ─────────────────────────────────────────────────────────
    if num_media > 0 and "audio" in media_content_type:
        transcribed = await transcribe_from_audio(media_url, auth)
        expense = await extract_from_text(f"[Voice note transcription]: {transcribed}")
        return await handle_expense(client, phone, expense, raw_input=f"[voice] {transcribed}")

    # ── Text expense ───────────────────────────────────────────────────────
    if body.strip():
        expense = await extract_from_text(body)
        return await handle_expense(client, phone, expense, raw_input=body)

    return "Send me a receipt photo or type your expense. Example: _'spent 200 on lunch'_"


async def handle_expense(client: Client, phone: str, expense: dict, raw_input: str) -> str:
    if not expense.get("is_expense", True):
        return (
            "I couldn't find an expense here.\n\n"
            "Try:\n📸 Receipt photo\n💬 'spent 500 on lunch'\n📱 UPI screenshot"
        )

    user = await get_or_create_user(client, phone)
    merchant = expense.get("merchant", "Unknown")
    amount   = float(expense.get("amount", 0))

    if await is_duplicate(client, user["id"], merchant, amount):
        return (
            f"⚠️ *Looks like a duplicate!*\n\n"
            f"I already logged *₹{amount:,.0f}* at *{merchant}* in the last 5 minutes.\n\n"
            "If this is a different transaction, wait a few minutes and send it again."
        )

    await save_transaction(client, user["id"], expense, raw_input)

    name = await get_user_name(client, phone)
    reply = format_expense_reply(expense)
    if name:
        reply = f"Got it, {name}! ✅\n\n" + reply
    return reply


async def handle_summary(client: Client, phone: str) -> str:
    user = await get_or_create_user(client, phone)
    data = await get_monthly_summary(client, user["id"])

    month_name = datetime.now().strftime("%B %Y")
    total = data["total"]
    count = data["count"]

    if count == 0:
        return (
            f"📊 *{month_name} Summary*\n\n"
            "No expenses logged yet this month.\n"
            "Send a receipt or type an expense to get started!"
        )

    reply  = f"📊 *{month_name} Summary*\n\n"
    reply += f"💰 Total spent: ₹{total:,.0f}\n"
    reply += f"🧾 Transactions: {count}\n\n"
    reply += "*By category:*\n"

    for cat, amt in data["categories"].items():
        emoji = CATEGORY_EMOJI.get(cat, "📦")
        pct   = (amt / total * 100) if total > 0 else 0
        reply += f"{emoji} {cat}: ₹{amt:,.0f} ({pct:.0f}%)\n"

    reply += "\n_Send any receipt to keep tracking!_"
    return reply
