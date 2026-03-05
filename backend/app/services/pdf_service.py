import asyncio
import logging
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML
from pathlib import Path
from app.services.qr_service import generate_qr_base64
from app.services.signature_service import get_logo_base64, get_signature_base64

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


async def generate_pdf(doc_type: str, document, company) -> bytes:
    """Generate a PDF for a quotation, invoice, or receipt."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _generate_pdf_sync, doc_type, document, company)


def _generate_pdf_sync(doc_type: str, document, company) -> bytes:
    doc_number = getattr(document, f"{doc_type}_number", "DOC")
    qr_base64 = generate_qr_base64(doc_type, doc_number)
    logo_data = get_logo_base64(company.logo_url if company else None)
    signature_data = get_signature_base64(company.signature_image_url if company else None)

    template_name = f"{doc_type}_professional.html"
    try:
        template = jinja_env.get_template(template_name)
    except Exception:
        template = jinja_env.get_template(f"{doc_type}_minimal.html")

    context = {
        "document": document,
        "company": company,
        "qr_base64": qr_base64,
        "logo_data": logo_data,
        "signature_data": signature_data,
        "doc_type": doc_type,
    }

    html_content = template.render(**context)
    pdf_bytes = HTML(string=html_content, base_url=".").write_pdf()
    return pdf_bytes
