import base64, hashlib
from cryptography.fernet import Fernet
from .settings import settings


def _derive_key() -> bytes:
    """Resolve the Fernet key.

    Prefers the dedicated FERNET_KEY (proper 32-byte urlsafe-base64 key).
    Falls back to deriving a key from JWT_SECRET for backward compatibility
    with existing dev databases. New deployments MUST set FERNET_KEY.
    """
    if settings.FERNET_KEY:
        # Validate format early so misconfig fails loudly, not on first encrypt.
        key = settings.FERNET_KEY.encode()
        Fernet(key)  # raises if invalid
        return key
    # Legacy fallback (dev only)
    h = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    return base64.urlsafe_b64encode(h)


def get_fernet() -> Fernet:
    return Fernet(_derive_key())


def encrypt_str(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()


def decrypt_str(token: str) -> str:
    return get_fernet().decrypt(token.encode()).decode()
