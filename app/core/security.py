import hashlib
import bcrypt

def _normalize_password(password: str) -> bytes:
    """
    Normalize password by hashing with SHA-256 first.
    This ensures passwords of any length work with bcrypt's 72-byte limit
    and provides consistent output length.
    """
    return hashlib.sha256(password.encode('utf-8')).digest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hashed password."""
    normalized = _normalize_password(plain_password)
    return bcrypt.checkpw(normalized, hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt (with SHA-256 pre-hashing)."""
    normalized = _normalize_password(password)
    hashed = bcrypt.hashpw(normalized, bcrypt.gensalt())
    return hashed.decode('utf-8')
