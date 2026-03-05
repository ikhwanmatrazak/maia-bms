import qrcode
import base64
from io import BytesIO
from app.config import get_settings

settings = get_settings()


def generate_qr_base64(doc_type: str, doc_number: str) -> str:
    url = f"{settings.frontend_url}/verify/{doc_type}/{doc_number}"
    qr = qrcode.QRCode(version=1, box_size=4, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")
