"""Base común de la API (`/api/`): decorador `@endpoint`, errores y autenticación por token."""

from .endpoint import ApiError, endpoint, error_response, json_body
from .keys import KeyMap

__all__ = ["ApiError", "KeyMap", "endpoint", "error_response", "json_body"]
