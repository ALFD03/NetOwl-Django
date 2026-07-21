"""
Carga de configuración sensible desde HashiCorp Vault (KV v2).

Sustituye al antiguo archivo `.env` como fuente de secretos. La app se
autentica contra Vault mediante AppRole (role_id / secret_id) y lee un
único secreto con la estructura::

    {
      "DJANGOCONFIG": {...},
      "DBCONFIG": {...}
    }

El `.env` sigue existiendo, pero solo con los datos de arranque
(VAULT_URL, VAULT_ROLE_ID, VAULT_SECRET_ID, VAULT_MOUNT_PATH, VAULT_PATH).

Este módulo vive en `backend/` porque lo consumen tanto la configuración
de Django (frontend/netowl_web/settings.py) como el conector de base de
datos (backend/database.py); `frontend` importa `backend`, nunca al revés.

Dependencias:
    - hvac (cliente de Vault)
    - pydantic (validación y conversión de tipos)
    - python-dotenv (carga de las variables VAULT_* de arranque)
"""

from __future__ import annotations

import os
import time
from typing import List

import hvac
from dotenv import load_dotenv
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
)

# Carga las variables VAULT_* del .env (si existe) antes de leerlas
load_dotenv()


class VaultConfigError(RuntimeError):
    """Error al obtener o validar la configuración almacenada en Vault."""


# --- Modelos de configuración ---

class DjangoModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    SECRET_KEY: str = Field(alias="DJANGO_SECRET_KEY")
    DEBUG: bool = Field(alias="DJANGO_DEBUG", default=False)
    SECURE_SSL: bool = Field(alias="DJANGO_SECURE_SSL", default=False)
    ALLOWED_HOSTS: List[str]
    # Orígenes de confianza para CSRF. Ojo: aquí cada valor lleva esquema
    # (https://ejemplo.com), a diferencia de ALLOWED_HOSTS.
    CSRF_TRUSTED_ORIGINS: List[str]

    @field_validator("ALLOWED_HOSTS", "CSRF_TRUSTED_ORIGINS", mode="before")
    @classmethod
    def split_hosts(cls, v):
        """Acepta tanto una lista como una cadena separada por comas."""
        if isinstance(v, str):
            return [h.strip() for h in v.split(",") if h.strip()]
        return v


class DBConfigModel(BaseModel):
    # El esquema NO está aquí: vive en el .env (DB_SCHEMA), porque no es
    # un secreto y cambia según el entorno al que apunte el despliegue.
    DB_NAME: str
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int = 5432
    DB_SSLMODE: str = "prefer"


class VaultDataStructure(BaseModel):
    """Estructura exacta del JSON almacenado en el secreto de Vault."""

    DJANGOCONFIG: DjangoModel
    DBCONFIG: DBConfigModel


# --- Orquestador ---

class VaultSettings:
    """Autentica contra Vault, lee el secreto y expone la configuración validada."""

    MAX_INTENTOS = 3
    ESPERA_ENTRE_INTENTOS = 0.5  # segundos, se multiplica por el nº de intento

    def __init__(self):
        self._vault_url = os.getenv("VAULT_URL")
        self._role_id = os.getenv("VAULT_ROLE_ID")
        self._secret_id = os.getenv("VAULT_SECRET_ID")
        self._mount_path = os.getenv("VAULT_MOUNT_PATH")
        self._secret_path = os.getenv("VAULT_PATH")

        raw_secrets = self._fetch_from_vault()

        try:
            validated = VaultDataStructure(**raw_secrets)
        except ValidationError as e:
            # Solo se reportan la ruta del campo y el motivo. El mensaje que
            # genera pydantic incluye el valor recibido (`input_value`), así
            # que nunca debe propagarse: acabaría en el log de gunicorn.
            # El `from None` corta el encadenado por el mismo motivo.
            detalle = "; ".join(
                f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}"
                for err in e.errors()
            )
            raise VaultConfigError(
                "Los secretos leídos de Vault no tienen la estructura esperada "
                f"(se esperan las claves DJANGOCONFIG y DBCONFIG) -> {detalle}"
            ) from None

        self.django = validated.DJANGOCONFIG
        self.db = validated.DBCONFIG

    def _fetch_from_vault(self) -> dict:
        missing = [
            name
            for name, value in (
                ("VAULT_URL", self._vault_url),
                ("VAULT_ROLE_ID", self._role_id),
                ("VAULT_SECRET_ID", self._secret_id),
                ("VAULT_MOUNT_PATH", self._mount_path),
                ("VAULT_PATH", self._secret_path),
            )
            if not value
        ]
        if missing:
            raise VaultConfigError(
                "Faltan variables de entorno para conectar con Vault: "
                f"{', '.join(missing)}. Revise el archivo .env (ver .env.example)."
            )

        # Se reintenta el ciclo completo (login + lectura) porque en un Vault
        # en HA el token emitido por un nodo puede tardar en propagarse, y la
        # lectura inmediata lo rechaza con "invalid token". Sin reintento, un
        # arranque de cada ocho fallaba por este motivo.
        for intento in range(1, self.MAX_INTENTOS + 1):
            ultimo = intento == self.MAX_INTENTOS
            try:
                return self._login_y_leer()
            except VaultConfigError:
                if ultimo:
                    raise
                time.sleep(self.ESPERA_ENTRE_INTENTOS * intento)

    def _login_y_leer(self) -> dict:
        try:
            client = hvac.Client(url=self._vault_url)
            client.auth.approle.login(
                role_id=self._role_id, secret_id=self._secret_id
            )
        except Exception as e:
            raise VaultConfigError(
                f"No se pudo autenticar con Vault en {self._vault_url} "
                f"usando AppRole: {e}"
            ) from e

        try:
            secret = client.secrets.kv.v2.read_secret_version(
                path=self._secret_path,
                mount_point=self._mount_path,
                raise_on_deleted_version=True,
            )
            return secret["data"]["data"]
        except Exception as e:
            raise VaultConfigError(
                f"No se pudo leer el secreto '{self._mount_path}/{self._secret_path}' "
                f"de Vault: {e}"
            ) from e


# --- Singleton: una sola lectura de Vault por proceso ---

_config: VaultSettings | None = None


def get_config() -> VaultSettings:
    global _config
    if _config is None:
        _config = VaultSettings()
    return _config
