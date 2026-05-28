from datetime import datetime
from app.services.extractor import extract_from_image, extract_from_text
from app.services.whatsapp import format_expense_reply
from app.services.database import get_or_create_user, save_transaction, get_monthly_summary
from app.config import settings

GREETING_KEYWORDS = {"hi", "hello", "hey", "start", "help"}
SUMMARY_KEYWORDS = {"summary", "report", "spending", "total", "how much"}

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

    # Greeting
    if body_lower in GREETING_KEYWORDS:
        return (
            "👋 *Welcome to EMSI!*\n"
            "_Expense Management System Intelligence_\n\n"
            "I'm your AI finance assistant. Send me:\n\n"
            "📸 Receipt or bill photo\n"
            "💬 'Spent 500 on lunch'\n"
            "📱 UPI/bank SMS screenshot\n\n"
            "I'll track everything automatically. Try sending a receipt now!"
        )

    # Monthly summary
    if any(kw in body_lower for kw in SUMMARY_KEYWORDS):
        return await handle_summary(from_number)

    # Image (receipt, screenshot, bill)
    if num_media > 0 and "image" in media_content_type:
        auth = (settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        expense = await extract_from_image(media_url, auth)
        return await handle_expense(from_number, expense, raw_input="[image]")

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
    await save_transaction(user["id"], expense, raw_input)
    return format_expense_reply(expense)


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
