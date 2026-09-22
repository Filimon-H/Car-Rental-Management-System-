"""Shared field types for request schemas."""
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
