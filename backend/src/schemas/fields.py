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


def _require_ethiopian_phone(value: object) -> object:
    """Normalise a phone number, rejecting anything that is not one.

    Length was the only check, so "notaphone" (nine characters) was stored
    in phone_primary. Phone is the identity key here — the customer search
    and the duplicate guard both key on it — so a malformed value leaves a
    record nobody can find and the guard cannot see.
    """
    value = normalize_ethiopian_phone(value)
    if isinstance(value, str) and not re.fullmatch(r"\+2519\d{8}", value):
        raise ValueError(
            "must be an Ethiopian mobile number, e.g. 0912345678 or +251912345678"
        )
    return value


#: A required phone number, stored canonically as +2519XXXXXXXX.
EthiopianPhone = Annotated[str, BeforeValidator(_require_ethiopian_phone)]

#: The same, optional: blank becomes None.
OptionalEthiopianPhone = Annotated[
    Optional[str], BeforeValidator(_require_ethiopian_phone)
]


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
