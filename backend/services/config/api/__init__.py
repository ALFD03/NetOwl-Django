"""Base común de la API (`/api/`): decorador `@endpoint`, errores y autenticación por token."""

from .endpoint import ApiError, endpoint, error_response, json_body

__all__ = ["ApiError", "endpoint", "error_response", "json_body"]
