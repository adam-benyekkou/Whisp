from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class WhispCreate(BaseModel):
    encrypted_payload: str
    is_file: bool = False
    password: Optional[str] = None
    ttl_minutes: int = 60  # Default 1 hour

class WhispRead(BaseModel):
    id: str
    encrypted_payload: str
    is_file: bool
    created_at: datetime
    expires_at: datetime

    class Config:
        from_attributes = True
