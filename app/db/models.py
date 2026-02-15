import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Integer
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Whisp(Base):
    __tablename__ = "whisps"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    encrypted_payload = Column(String, nullable=False)  # The encrypted secret (string or file metadata)
    is_file = Column(Boolean, default=False)
    file_path = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)  # Optional: Server-side password check
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    max_access = Column(Integer, default=1)
    access_count = Column(Integer, default=0)
