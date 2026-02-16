from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class WhispCreate(BaseModel):
    """
    Schema for creating a new Whisp.
    
    Attributes:
        encrypted_payload (str): The client-side encrypted secret or metadata.
        is_file (bool): Whether the whisp contains an uploaded file.
        password (Optional[str]): Optional password to protect the whisp.
        ttl_minutes (int): Time-to-live in minutes before automatic destruction.
    """
    encrypted_payload: str
    is_file: bool = False
    password: Optional[str] = None
    ttl_minutes: int = 60  # Default 1 hour

class WhispRead(BaseModel):
    """
    Schema for reading Whisp metadata.
    
    Attributes:
        id (str): Unique identifier for the whisp.
        encrypted_payload (str): The encrypted data or filename.
        is_file (bool): True if the whisp is a file.
        created_at (datetime): When the whisp was generated.
        expires_at (datetime): When the whisp will self-destruct.
    """
    id: str
    encrypted_payload: str
    is_file: bool
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True

