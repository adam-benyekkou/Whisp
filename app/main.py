from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from datetime import datetime, timedelta
from typing import Optional
import os
import uuid
import aiofiles

from app.db.session import engine, get_db
from app.db.models import Base, Whisp
from app.api import schemas
from app.core.security import get_password_hash, verify_password

app = FastAPI(title="Whisp API")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORAGE_DIR = "app/storage/files"
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
os.makedirs(STORAGE_DIR, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

async def cleanup_expired_whisps(db: AsyncSession):
    """Background task to clean up expired whisps"""
    await db.execute(delete(Whisp).where(Whisp.expires_at < datetime.utcnow()))
    await db.commit()

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/")
async def read_index():
    return FileResponse("app/static/index.html")

def delete_file(path: str):
    if os.path.exists(path):
        os.remove(path)

@app.post("/api/whisps", response_model=schemas.WhispRead)
async def create_whisp(
    background_tasks: BackgroundTasks,
    encrypted_payload: str = Form(...),
    ttl_minutes: int = Form(60),
    password: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: AsyncSession = Depends(get_db)
):
    # Validate TTL
    if ttl_minutes < 1 or ttl_minutes > 10080:  # Max 1 week
        raise HTTPException(status_code=400, detail="TTL must be between 1 minute and 1 week")
    
    expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
    
    password_hash = None
    if password:
        password_hash = get_password_hash(password)
        
    whisp_id = str(uuid.uuid4())
    file_path = None
    
    if file:
        # Validate file size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size: {MAX_FILE_SIZE} bytes")
        
        # Sanitize filename to prevent path traversal
        safe_filename = os.path.basename(file.filename or "unnamed")
        file_path = os.path.join(STORAGE_DIR, f"{whisp_id}_{safe_filename}")
        
        # Use aiofiles for async file write
        async with aiofiles.open(file_path, "wb") as buffer:
            await buffer.write(content)
            
    new_whisp = Whisp(
        id=whisp_id,
        encrypted_payload=encrypted_payload,
        is_file=bool(file),
        file_path=file_path,
        password_hash=password_hash,
        expires_at=expires_at
    )
    
    db.add(new_whisp)
    await db.commit()
    await db.refresh(new_whisp)
    
    # Schedule background cleanup
    background_tasks.add_task(cleanup_expired_whisps, db)
    
    return new_whisp

@app.get("/api/whisps/{whisp_id}")
async def get_whisp(
    whisp_id: str,
    password: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Whisp).where(Whisp.id == whisp_id))
    whisp = result.scalars().first()
    
    # Check if exists and not expired
    if not whisp or whisp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Whisp not found or expired")
    
    if whisp.password_hash:
        if not password or not verify_password(password, whisp.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
    
    # One-time access: delete after retrieval (if it's just a message)
    # If it's a file, we keep it until the file is downloaded
    data = schemas.WhispRead.model_validate(whisp)
    
    if not whisp.is_file:
        await db.delete(whisp)
        if whisp.file_path and os.path.exists(whisp.file_path):
            os.remove(whisp.file_path)
        await db.commit()
    
    return data

@app.get("/api/whisps/{whisp_id}/file")
async def get_whisp_file(
    whisp_id: str,
    background_tasks: BackgroundTasks,
    password: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Whisp).where(Whisp.id == whisp_id))
    whisp = result.scalars().first()
    
    # Check if exists, is file, not expired
    if not whisp or not whisp.is_file or not whisp.file_path or whisp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="File not found or expired")
    
    # Verify file actually exists on disk
    if not os.path.exists(whisp.file_path):
        await db.delete(whisp)
        await db.commit()
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    if whisp.password_hash:
        if not password or not verify_password(password, whisp.password_hash):
            raise HTTPException(status_code=401, detail="Invalid password")
            
    file_path = whisp.file_path
    
    # Delete from DB immediately (one-time access)
    await db.delete(whisp)
    await db.commit()
    
    # Delete file from disk after sending
    background_tasks.add_task(delete_file, file_path)
    
    return FileResponse(file_path)
