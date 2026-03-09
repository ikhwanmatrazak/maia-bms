import base64
import os
from pathlib import Path

# Anchor to the backend/ directory (3 levels up from this file)
_BACKEND_DIR = Path(__file__).parent.parent.parent


def _resolve_upload_path(url: str | None) -> Path | None:
    """Convert a URL like /uploads/logos/file.png to an absolute file path."""
    if not url:
        return None
    relative = url.lstrip("/")
    # Try absolute path anchored to backend dir first
    abs_path = _BACKEND_DIR / relative
    if abs_path.exists():
        return abs_path
    # Fallback: try relative to CWD (legacy behaviour)
    cwd_path = Path(relative)
    if cwd_path.exists():
        return cwd_path
    return None


def get_signature_base64(signature_url: str | None) -> str | None:
    path = _resolve_upload_path(signature_url)
    if path:
        return base64.b64encode(path.read_bytes()).decode("utf-8")
    return None


def get_logo_base64(logo_url: str | None) -> str | None:
    path = _resolve_upload_path(logo_url)
    if not path:
        return None
    content = path.read_bytes()
    ext = path.suffix.lower()
    mime = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
    }.get(ext, "image/png")
    return f"data:{mime};base64,{base64.b64encode(content).decode()}"
