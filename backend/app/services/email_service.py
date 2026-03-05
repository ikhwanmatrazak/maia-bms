import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import Optional

logger = logging.getLogger(__name__)


async def send_email(
    settings,
    smtp_password: str,
    to_email: str,
    subject: str,
    html_body: str,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: Optional[str] = None,
):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.smtp_from_name or settings.smtp_from_email} <{settings.smtp_from_email}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_body, "html"))

    if pdf_bytes and pdf_filename:
        part = MIMEBase("application", "octet-stream")
        part.set_payload(pdf_bytes)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{pdf_filename}"')
        msg.attach(part)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.smtp_user, smtp_password)
            server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        logger.info(f"Email sent to {to_email}: {subject}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        raise


async def send_test_email(settings, smtp_password: str, to_email: str):
    html_body = """
    <html><body>
    <h2>MAIA BMS - SMTP Test</h2>
    <p>This is a test email from your MAIA Business Management System.</p>
    <p>Your SMTP configuration is working correctly.</p>
    </body></html>
    """
    await send_email(
        settings,
        smtp_password,
        to_email,
        "MAIA BMS - SMTP Test Email",
        html_body,
    )
