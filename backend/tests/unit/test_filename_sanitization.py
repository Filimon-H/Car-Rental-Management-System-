"""Uploaded filenames are attacker-controlled and get echoed back on download."""

import pytest

from src.api.routers.customer_documents import sanitize_display_name


class TestSanitizeDisplayName:
    def test_strips_header_breaking_characters(self):
        """The original defect: closing the quote to inject a second directive."""
        result = sanitize_display_name('x".pdf"; filename="evil.exe')

        assert '"' not in result
        assert ";" not in result

    def test_strips_crlf(self):
        """CRLF in a header value splits it into additional headers."""
        result = sanitize_display_name("report\r\nX-Injected: yes.pdf")

        assert "\r" not in result
        assert "\n" not in result

    def test_discards_directory_traversal(self):
        assert sanitize_display_name("../../etc/passwd") == "passwd"
        assert sanitize_display_name("/absolute/path/file.pdf") == "file.pdf"

    def test_keeps_ordinary_names_intact(self):
        assert sanitize_display_name("Driving Licence 2026.pdf") == "Driving Licence 2026.pdf"

    def test_falls_back_when_nothing_survives(self):
        assert sanitize_display_name("") == "upload"
        assert sanitize_display_name('"""') == "upload"

    def test_caps_length(self):
        assert len(sanitize_display_name("a" * 400 + ".pdf")) <= 255


class TestDownloadHeaderIsEscaped:
    """FileResponse must own the header; a manual one bypassed its escaping."""

    def test_starlette_escapes_a_hostile_filename(self, tmp_path):
        from starlette.responses import FileResponse

        target = tmp_path / "stored.bin"
        target.write_bytes(b"content")

        response = FileResponse(
            path=str(target),
            filename='x".pdf"; filename="evil.exe',
            media_type="application/octet-stream",
        )
        disposition = response.headers["content-disposition"]

        # The injected second directive must not survive as a real directive.
        assert '; filename="evil.exe"' not in disposition
        assert disposition.startswith("attachment;")
