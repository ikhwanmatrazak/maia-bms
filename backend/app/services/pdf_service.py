import asyncio
import logging
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pathlib import Path
from app.services.signature_service import get_logo_base64, get_signature_base64

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent.parent / "templates" / "pdf"

jinja_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


def _fmt(value, decimals=2):
    try:
        return f"{float(value):,.{decimals}f}"
    except (ValueError, TypeError):
        return value


jinja_env.filters["fmt"] = _fmt


async def generate_pdf(doc_type: str, document, company, template_style: str = "professional") -> bytes:
    """Generate a PDF using Playwright (headless Chromium) — works on all platforms."""
    logo_data = get_logo_base64(company.logo_url if company else None)
    signature_data = get_signature_base64(company.signature_image_url if company else None)

    template_name = f"{doc_type}_{template_style}.html"
    try:
        template = jinja_env.get_template(template_name)
    except Exception:
        template = jinja_env.get_template(f"{doc_type}_professional.html")

    context = {
        "document": document,
        "company": company,
        "logo_data": logo_data,
        "signature_data": signature_data,
        "doc_type": doc_type,
    }

    html_content = template.render(**context)

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _render_pdf, html_content)


def _render_pdf(html_content: str) -> bytes:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_content, wait_until="networkidle")
        pdf_bytes = page.pdf(format="A4", print_background=True)
        browser.close()
    return pdf_bytes
