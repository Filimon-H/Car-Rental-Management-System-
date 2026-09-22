"""Uploads must be judged by their bytes, not by their filename.

A text file named x.jpg with Content-Type image/jpeg was previously stored as
a vehicle photo and served back as a broken image, because both of those are
set by whoever makes the request.
"""
import pytest

from src.core.upload_validation import (
    describe_content,
    extension_matches_content,
    is_real_document,
    is_real_image,
    sniff_format,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 32
WEBP = b"RIFF" + (1000).to_bytes(4, "little") + b"WEBP" + b"\x00" * 32
PDF = b"%PDF-1.7\n" + b"\x00" * 32
GIF = b"GIF89a" + b"\x00" * 32

TEXT = b"this is not an image at all\n"
EMPTY = b""
# A payload that would pass an extension check while being a script.
SCRIPT = b"#!/bin/sh\nrm -rf /\n"
# PNG signature arriving one byte late must not be accepted.
OFFSET_PNG = b"\x00" + b"\x89PNG\r\n\x1a\n"


class TestSniffFormat:
    @pytest.mark.parametrize(
        "content, expected",
        [(PNG, "png"), (JPEG, "jpeg"), (WEBP, "webp"), (PDF, "pdf"), (GIF, "gif")],
    )
    def test_recognises_real_signatures(self, content, expected):
        assert sniff_format(content) == expected

    @pytest.mark.parametrize("content", [TEXT, EMPTY, SCRIPT, OFFSET_PNG])
    def test_returns_none_for_non_media(self, content):
        assert sniff_format(content) is None

    def test_riff_without_the_webp_marker_is_not_webp(self):
        # A RIFF container can hold audio; only WEBP is an image.
        wav = b"RIFF" + (1000).to_bytes(4, "little") + b"WAVE" + b"\x00" * 32
        assert sniff_format(wav) is None


class TestIsRealImage:
    @pytest.mark.parametrize("content", [PNG, JPEG, WEBP])
    def test_accepts_allowed_image_formats(self, content):
        assert is_real_image(content) is True

    @pytest.mark.parametrize("content", [TEXT, EMPTY, SCRIPT, PDF, GIF])
    def test_rejects_everything_else(self, content):
        # PDF and GIF are real formats but not accepted as vehicle photos.
        assert is_real_image(content) is False

    def test_rejects_the_reported_attack(self):
        # The exact case from QA: text content, image filename.
        assert is_real_image(b"this is a text file pretending to be x.jpg") is False


class TestIsRealDocument:
    @pytest.mark.parametrize("content", [PNG, JPEG, WEBP, PDF])
    def test_accepts_images_and_pdf(self, content):
        assert is_real_document(content) is True

    @pytest.mark.parametrize("content", [TEXT, EMPTY, SCRIPT, GIF])
    def test_rejects_everything_else(self, content):
        assert is_real_document(content) is False


class TestExtensionMatchesContent:
    def test_jpg_and_jpeg_are_interchangeable(self):
        assert extension_matches_content("photo.jpg", JPEG) is True
        assert extension_matches_content("photo.jpeg", JPEG) is True

    def test_detects_a_pdf_wearing_an_image_extension(self):
        assert extension_matches_content("scan.jpg", PDF) is False

    def test_detects_a_png_named_jpg(self):
        assert extension_matches_content("photo.jpg", PNG) is False

    def test_case_insensitive(self):
        assert extension_matches_content("PHOTO.JPG", JPEG) is True

    def test_unrecognised_content_never_matches(self):
        assert extension_matches_content("photo.jpg", TEXT) is False


class TestDescribeContent:
    def test_names_the_detected_format(self):
        assert describe_content(PDF) == "pdf"
        assert describe_content(JPEG) == "jpeg"

    def test_says_unrecognised_rather_than_returning_none(self):
        # This string reaches the user in an error message.
        assert describe_content(TEXT) == "unrecognised"
