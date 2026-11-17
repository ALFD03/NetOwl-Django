"""Base común de la API (`/api/`): decorador `@endpoint`, errores y autenticación por token."""

from .endpoint import ApiError, endpoint, error_response

__all__ = ["ApiError", "endpoint", "error_response"]
