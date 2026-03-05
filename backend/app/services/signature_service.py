import base64
import os


def get_signature_base64(signature_url: str | None) -> str | None:
    if not signature_url:
        return None
    # Convert URL path to file path
    file_path = signature_url.lstrip("/")
    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    return None


def get_logo_base64(logo_url: str | None) -> str | None:
    if not logo_url:
        return None
    file_path = logo_url.lstrip("/")
    if os.path.exists(file_path):
        with open(file_path, "rb") as f:
            content = f.read()
        ext = os.path.splitext(file_path)[1].lower()
        mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".svg": "image/svg+xml", ".webp": "image/webp"}.get(ext, "image/png")
        return f"data:{mime};base64,{base64.b64encode(content).decode()}"
    return None
