"""Shared field types for request schemas."""
import re
from typing import Annotated, Optional

from pydantic import BeforeValidator, EmailStr


def _blank_to_none(value: object) -> object:
    """Treat a blank string as an absent value.

    HTML forms submit an untouched optional input as "", not as null. Without
    this, leaving an optional Email box empty failed EmailStr validation with
    "An email address must have an @-sign" and the whole save was rejected.

    Only whitespace-only strings are converted; anything else is passed
    through untouched so genuinely malformed input ("abc") still errors.
    """
    if isinstance(value, str) and value.strip() == "":
        return None
    return value


# An optional email that tolerates "" from a form but still rejects bad input.
OptionalEmail = Annotated[Optional[EmailStr], BeforeValidator(_blank_to_none)]


def normalize_ethiopian_phone(value: object) -> object:
    """Normalize common Ethiopian mobile formats to ``+2519XXXXXXXX``.

    Blank optional inputs become ``None``. Values outside the recognized
    formats pass through so the field's normal validation can report them.
    """
    value = _blank_to_none(value)
    if not isinstance(value, str):
        return value
    cleaned = re.sub(r"[\s()\-]", "", value)
    if re.fullmatch(r"09\d{8}", cleaned):
        return f"+251{cleaned[1:]}"
    if re.fullmatch(r"9\d{8}", cleaned):
        return f"+251{cleaned}"
    if re.fullmatch(r"2519\d{8}", cleaned):
        return f"+{cleaned}"
    if re.fullmatch(r"\+2519\d{8}", cleaned):
        return cleaned
    return value
