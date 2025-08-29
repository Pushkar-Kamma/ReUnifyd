import base64, hashlib
from cryptography.fernet import Fernet
from .settings import settings

def _derive_key() -> bytes:
    h = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    return base64.urlsafe_b64encode(h)

def get_fernet() -> Fernet:
    return Fernet(_derive_key())

def encrypt_str(plain: str) -> str:
    return get_fernet().encrypt(plain.encode()).decode()

def decrypt_str(token: str) -> str:
    return get_fernet().decrypt(token.encode()).decode()
