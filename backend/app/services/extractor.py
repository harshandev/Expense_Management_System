import json
import httpx
import base64
from openai import AsyncOpenAI
from app.config import settings

VALID_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """You are an AI expense extraction assistant for an Indian expense tracking app called ExpenseArc.

Extract expense information from the provided content and return ONLY a valid JSON object with these fields:
- is_expense: boolean (true if this contains expense info, false otherwise)
- merchant: string (merchant/store/restaurant name)
- amount: number (rupees, numeric only, no symbols)
- category: string (exactly one of: Food, Transport, Shopping, Entertainment, Health, Utilities, Education, Investment, Other)
- subcategory: string (specific e.g. "Food Delivery", "Groceries", "Petrol", "Movie", "Medicine")
- date: string (YYYY-MM-DD format, use today's date if not found)
- description: string (one line summary)
- confidence: number (0.0 to 1.0, how confident you are)
- currency: string (default "INR")

Indian context: UPI payments, Swiggy/Zomato/Amazon/Zepto/Blinkit are common. Amounts in ₹ or Rs.
Return ONLY valid JSON. No explanation, no markdown, no code blocks."""


async def extract_from_image(image_url: str, auth: tuple) -> dict:
    """Use GPT-4o Vision to extract expense from receipt/screenshot image."""
    # follow_redirects=True is critical — Twilio media URLs redirect to S3/CDN
    async with httpx.AsyncClient(follow_redirects=True) as http_client:
        response = await http_client.get(image_url, auth=auth, timeout=30.0)
        response.raise_for_status()
        image_data = base64.standard_b64encode(response.content).decode("utf-8")
        raw_type = response.headers.get("content-type", "image/jpeg")
        content_type = raw_type.split(";")[0].strip()
        if content_type not in VALID_IMAGE_TYPES:
            content_type = "image/jpeg"

    result = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": SYSTEM_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{content_type};base64,{image_data}",
                            "detail": "high",
                        },
                    },
                ],
            }
        ],
        response_format={"type": "json_object"},
        max_tokens=500,
    )
    return json.loads(result.choices[0].message.content)


async def extract_from_text(text: str) -> dict:
    """Use GPT-4o mini to extract expense from text/SMS message."""
    result = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        response_format={"type": "json_object"},
        max_tokens=300,
    )
    return json.loads(result.choices[0].message.content)
