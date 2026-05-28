from fastapi import APIRouter, Form
from fastapi.responses import PlainTextResponse
from app.services.message_router import route_message

router = APIRouter()


@router.post("/whatsapp", response_class=PlainTextResponse)
async def whatsapp_webhook(
    Body: str = Form(default=""),
    From: str = Form(default=""),
    NumMedia: str = Form(default="0"),
    MediaUrl0: str = Form(default=""),
    MediaContentType0: str = Form(default=""),
):
    reply = await route_message(
        from_number=From,
        body=Body,
        num_media=int(NumMedia),
        media_url=MediaUrl0,
        media_content_type=MediaContentType0,
    )

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>{reply}</Message>
</Response>"""
    return PlainTextResponse(content=twiml, media_type="text/xml")
