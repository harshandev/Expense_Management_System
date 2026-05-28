from twilio.rest import Client
from app.config import settings

_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


def send_whatsapp_message(to: str, body: str) -> None:
    """Send a WhatsApp message via Twilio."""
    _client.messages.create(
        from_=settings.TWILIO_WHATSAPP_NUMBER,
        to=to,
        body=body,
    )


def format_expense_reply(expense: dict) -> str:
    """Format extracted expense data into a friendly WhatsApp reply."""
    if not expense.get("is_expense", True):
        return (
            "I couldn't find an expense here.\n\n"
            "Try sending:\n"
            "📸 A receipt or bill photo\n"
            "💬 Text like 'spent 500 on lunch'\n"
            "📱 A UPI payment screenshot"
        )

    amount = expense.get("amount", 0)
    merchant = expense.get("merchant", "Unknown")
    category = expense.get("category", "Other")
    subcategory = expense.get("subcategory", "")
    confidence = expense.get("confidence", 1.0)

    cat_display = f"{category} › {subcategory}" if subcategory else category

    reply = f"✅ *Logged!*\n\n"
    reply += f"💰 ₹{amount:,.0f}\n"
    reply += f"🏪 {merchant}\n"
    reply += f"📂 {cat_display}\n"

    if confidence < 0.75:
        reply += f"\n⚠️ _Not 100% sure about this. Reply with_ *correct* _to edit._"

    reply += f"\n\nReply *summary* to see this month's spending."

    return reply
