import json
import httpx
import base64
import fitz  # PyMuPDF — handles both text PDFs and scanned PDFs
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


async def extract_from_pdf(pdf_url: str, auth: tuple) -> dict:
    """
    Extract expense from a PDF receipt — full multi-page support.

    Strategy:
      1. Download PDF from Twilio (follow redirects)
      2. Text extraction across ALL pages → GPT-4o mini if text found (cheap)
      3. Scanned PDF fallback → render ALL pages as images (capped at 5)
         and send in one GPT-4o Vision call
    """
    # ── Download ────────────────────────────────────────────────────────────
    async with httpx.AsyncClient(follow_redirects=True) as http_client:
        response = await http_client.get(pdf_url, auth=auth, timeout=30.0)
        response.raise_for_status()
        pdf_bytes = response.content

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)

    # ── Strategy 1: text PDF — extract ALL pages ─────────────────────────────
    # Works for: Swiggy/Zomato invoice, Amazon order, bank statement, credit card bill
    text_parts = []
    for page in doc:
        text_parts.append(page.get_text())
    extracted_text = "\n".join(text_parts).strip()

    if len(extracted_text) >= 80:
        doc.close()
        # 6000 chars ≈ 1500 tokens — enough for a multi-page statement
        return await extract_from_text(
            f"[PDF Receipt – {total_pages} page(s)]\n{extracted_text[:6000]}"
        )

    # ── Strategy 2: scanned PDF — render ALL pages, cap at 5 ────────────────
    # Each page rendered at 2× zoom (~150 DPI) for good OCR quality
    MAX_PAGES = 5
    pages_to_render = min(total_pages, MAX_PAGES)
    mat = fitz.Matrix(2.0, 2.0)

    image_contents = []
    for i in range(pages_to_render):
        pix = doc[i].get_pixmap(matrix=mat)
        img_b64 = base64.standard_b64encode(pix.tobytes("png")).decode("utf-8")
        image_contents.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{img_b64}", "detail": "high"},
        })
    doc.close()

    page_note = (
        f"This is a {total_pages}-page scanned PDF. "
        f"All {pages_to_render} page(s) are shown below."
        if total_pages > 1
        else "This is a 1-page scanned PDF."
    )

    result = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"{SYSTEM_PROMPT}\n\n{page_note}"},
                    *image_contents,
                ],
            }
        ],
        response_format={"type": "json_object"},
        max_tokens=500,
    )
    return json.loads(result.choices[0].message.content)


async def transcribe_from_audio(audio_url: str, auth: tuple) -> str:
    """
    Transcribe a WhatsApp voice note using OpenAI Whisper.

    WhatsApp sends audio as audio/ogg (Opus codec). Whisper handles it natively.
    No language specified → automatic multilingual detection (Hindi, Tamil, English, etc.)
    """
    import io

    # Download audio — same follow_redirects pattern as image/PDF
    async with httpx.AsyncClient(follow_redirects=True) as http_client:
        response = await http_client.get(audio_url, auth=auth, timeout=30.0)
        response.raise_for_status()
        audio_bytes = response.content
        raw_type = response.headers.get("content-type", "audio/ogg")
        content_type = raw_type.split(";")[0].strip()

    # Map MIME type → file extension so Whisper can detect the codec
    ext_map = {
        "audio/ogg":  "ogg",
        "audio/mpeg": "mp3",
        "audio/mp4":  "mp4",
        "audio/wav":  "wav",
        "audio/webm": "webm",
        "audio/amr":  "amr",
    }
    ext = ext_map.get(content_type, "ogg")

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = f"voice.{ext}"  # Whisper uses filename to detect format

    result = await client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        # No `language` param → Whisper auto-detects (supports Hindi/Tamil/English/etc.)
    )
    return result.text
