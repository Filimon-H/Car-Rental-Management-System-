"""Content-based validation for uploaded files.

The upload endpoints previously trusted the filename extension and the
client-supplied Content-Type header. Both are set by whoever makes the
request, so a text file named `x.jpg` with `Content-Type: image/jpeg` was
stored as a vehicle photo and served back as a broken image.

The functions here decide what a file *is* by reading its leading bytes, so
the declared name and type no longer grant access on their own.
"""
from __future__ import annotations

from pathlib import Path

# Leading byte signatures. Kept to the formats the API accepts rather than
# pulling in a general-purpose sniffing dependency.
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_PDF_MAGIC = b"%PDF-"
_GIF_MAGICS = (b"GIF87a", b"GIF89a")

# RIFF....WEBP — the size field sits between the two markers.
_RIFF_MAGIC = b"RIFF"
_WEBP_MARKER = b"WEBP"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DOCUMENT_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}

IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
DOCUMENT_MIMES = IMAGE_MIMES | {"application/pdf"}


def sniff_format(content: bytes) -> str | None:
    """Return 'jpeg', 'png', 'webp', 'pdf', 'gif', or None if unrecognised."""
    if content.startswith(_PNG_MAGIC):
        return "png"
    if content.startswith(_JPEG_MAGIC):
        return "jpeg"
    if content.startswith(_PDF_MAGIC):
        return "pdf"
    if content.startswith(_GIF_MAGICS):
        return "gif"
    if content.startswith(_RIFF_MAGIC) and content[8:12] == _WEBP_MARKER:
        return "webp"
    return None


def is_real_image(content: bytes) -> bool:
    """True when the bytes begin with a signature of an accepted image format.

    GIF is recognised by sniff_format so it can be named in an error message,
    but is deliberately not accepted — the API's allowed extensions do not
    include it.
    """
    return sniff_format(content) in {"jpeg", "png", "webp"}


def is_real_document(content: bytes) -> bool:
    """True for an accepted image or a PDF."""
    return sniff_format(content) in {"jpeg", "png", "webp", "pdf"}


def extension_matches_content(filename: str, content: bytes) -> bool:
    """True when the extension agrees with what the bytes actually are.

    Stops a PDF being stored as `scan.jpg` and then failing to render, while
    treating .jpg and .jpeg as the same thing.
    """
    fmt = sniff_format(content)
    if fmt is None:
        return False
    ext = Path(filename).suffix.lower()
    expected = {
        "jpeg": {".jpg", ".jpeg"},
        "png": {".png"},
        "webp": {".webp"},
        "pdf": {".pdf"},
        "gif": {".gif"},
    }[fmt]
    return ext in expected


def describe_content(content: bytes) -> str:
    """Name the detected format for an error message."""
    return sniff_format(content) or "unrecognised"
