from datetime import datetime
from app.services.extractor import extract_from_image, extract_from_text, extract_from_pdf, transcribe_from_audio
from app.services.whatsapp import format_expense_reply
from app.services.database import get_or_create_user, save_transaction, get_monthly_summary, is_duplicate, get_user_name, set_user_name
from app.config import settings

GREETING_KEYWORDS  = {"hi", "hello", "hey", "start", "help"}
SUMMARY_KEYWORDS   = {"summary", "report", "spending", "total", "how much"}
NAME_PROMPT_MARKER = "AWAITING_NAME"  # stored in a module-level dict as a simple state flag

# In-memory map: phone → True while we're waiting for them to reply with their name
# (resets on server restart — good enough for demo; persist to DB for prod)
_awaiting_name: dict[str, bool] = {}

CATEGORY_EMOJI = {
    "Food": "🍔", "Transport": "🚗", "Shopping": "🛍",
    "Entertainment": "🎬", "Health": "💊", "Utilities": "⚡",
    "Education": "📚", "Investment": "📈", "Other": "📦",
}


async def route_message(
    from_number: str,
    body: str,
    num_media: int,
    media_url: str,
    media_content_type: str,
) -> str:
    body_lower = body.strip().lower()

    # ── Name capture flow ──────────────────────────────────────────────────
    # If we asked for the user's name last turn, save whatever they reply with
    if _awaiting_name.get(from_number) and num_media == 0 and body.strip():
        name = body.strip().title()
        await set_user_name(from_number, name)
        _awaiting_name.pop(from_number, None)
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
        existing_name = await get_user_name(from_number)
        if existing_name:
            # Returning user — greet by name
            return (
                f"👋 Welcome back, *{existing_name}*!\n\n"
                "Send me a receipt, voice note, or type an expense — I'll track it instantly.\n\n"
                "Say *summary* to see your monthly report."
            )
        # New user — ask for name
        _awaiting_name[from_number] = True
        return (
            "👋 *Welcome to EMSI!*\n"
            "_Expense Management System Intelligence_\n\n"
            "I'm your AI finance assistant. Before we start — *what should I call you?*\n\n"
            "_Just reply with your name_ 😊"
        )

    # Monthly summary
    if any(kw in body_lower for kw in SUMMARY_KEYWORDS):
        return await handle_summary(from_number)

    # Image receipt (JPEG, PNG, WebP, GIF)
    if num_media > 0 and "image" in media_content_type:
        auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        expense = await extract_from_image(media_url, auth)
        return await handle_expense(from_number, expense, raw_input="[image]")

    # PDF receipt (e-invoice, bank statement, scanned bill)
    if num_media > 0 and "pdf" in media_content_type:
        auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        expense = await extract_from_pdf(media_url, auth)
        return await handle_expense(from_number, expense, raw_input="[pdf]")

    # Voice note (WhatsApp mic button → audio/ogg; also handles mp3/mp4/wav)
    if num_media > 0 and "audio" in media_content_type:
        auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        transcribed = await transcribe_from_audio(media_url, auth)
        expense = await extract_from_text(f"[Voice note transcription]: {transcribed}")
        return await handle_expense(from_number, expense, raw_input=f"[voice] {transcribed}")

    # Text expense
    if body.strip():
        expense = await extract_from_text(body)
        return await handle_expense(from_number, expense, raw_input=body)

    return "Send me a receipt photo or type your expense. Example: _'spent 200 on lunch'_"


async def handle_expense(from_number: str, expense: dict, raw_input: str) -> str:
    """Save expense to DB and return formatted reply."""
    if not expense.get("is_expense", True):
        return (
            "I couldn't find an expense here.\n\n"
            "Try:\n📸 Receipt photo\n💬 'spent 500 on lunch'\n📱 UPI screenshot"
        )

    user = await get_or_create_user(from_number)

    # ── Duplicate guard ────────────────────────────────────────────────────
    merchant = expense.get("merchant", "Unknown")
    amount   = float(expense.get("amount", 0))
    if await is_duplicate(user["id"], merchant, amount):
        return (
            f"⚠️ *Looks like a duplicate!*\n\n"
            f"I already logged *₹{amount:,.0f}* at *{merchant}* in the last 5 minutes.\n\n"
            "If this is a different transaction, wait a few minutes and send it again."
        )

    await save_transaction(user["id"], expense, raw_input)

    # Personalise reply with name if we have it
    name = await get_user_name(from_number)
    reply = format_expense_reply(expense)
    if name:
        reply = f"Got it, {name}! ✅\n\n" + reply
    return reply


async def handle_summary(from_number: str) -> str:
    """Fetch real monthly summary from DB."""
    user = await get_or_create_user(from_number)
    data = await get_monthly_summary(user["id"])

    month_name = datetime.now().strftime("%B %Y")
    total = data["total"]
    count = data["count"]

    if count == 0:
        return (
            f"📊 *{month_name} Summary*\n\n"
            "No expenses logged yet this month.\n"
            "Send a receipt or type an expense to get started!"
        )

    reply = f"📊 *{month_name} Summary*\n\n"
    reply += f"💰 Total spent: ₹{total:,.0f}\n"
    reply += f"🧾 Transactions: {count}\n\n"
    reply += "*By category:*\n"

    for cat, amount in data["categories"].items():
        emoji = CATEGORY_EMOJI.get(cat, "📦")
        pct = (amount / total * 100) if total > 0 else 0
        reply += f"{emoji} {cat}: ₹{amount:,.0f} ({pct:.0f}%)\n"

    reply += "\n_Send any receipt to keep tracking!_"
    return reply
