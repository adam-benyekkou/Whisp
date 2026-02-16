import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Whisp(Base):
    """
    SQLAlchemy model for a Whisp (secret).
    
    A Whisp stores an encrypted payload (or file metadata) that is designed 
    to be retrieved once and then destroyed.
    
    Attributes:
        id (str): Primary key, UUID string.
        encrypted_payload (str): Encrypted secret string or JSON metadata for files.
        is_file (bool): Flag indicating if this whisp represents a file artifact.
        file_path (str): Internal path to the encrypted file on disk (tmpfs).
        password_hash (str): Optional bcrypt hash for additional server-side auth.
        created_at (datetime): Creation timestamp.
        expires_at (datetime): Expiration timestamp for auto-cleanup.
        max_access (int): Max number of times the secret can be viewed (default 1).
        access_count (int): Current number of times viewed.
    """
    __tablename__ = "whisps"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    encrypted_payload = Column(String, nullable=False)  # The encrypted secret (string or file metadata)
    is_file = Column(Boolean, default=False)
    file_path = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # Optional: Server-side password check
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)
    max_access = Column(Integer, default=1)
    access_count = Column(Integer, default=0)
