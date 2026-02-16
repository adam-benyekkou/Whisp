import pytest
import asyncio
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.db.session import get_db
from app.db.models import Base
import os

# Test database URL - using memory for speed and to avoid permission issues
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def override_get_db():
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest_asyncio.fixture(autouse=True, scope="function")
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # No need to drop or remove file for in-memory

@pytest.mark.asyncio
async def test_create_whisp():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/api/whisps",
            data={
                "encrypted_payload": "test_payload",
                "ttl_minutes": 60
            }
        )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["encrypted_payload"] == "test_payload"

@pytest.mark.asyncio
async def test_get_whisp_and_one_time_access():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create
        create_res = await ac.post(
            "/api/whisps",
            data={"encrypted_payload": "secret", "ttl_minutes": 10}
        )
        whisp_id = create_res.json()["id"]

        # Get first time (success)
        get_res = await ac.get(f"/api/whisps/{whisp_id}")
        assert get_res.status_code == 200
        assert get_res.json()["encrypted_payload"] == "secret"

        # Get second time (fail - 404 due to one-time access)
        get_res2 = await ac.get(f"/api/whisps/{whisp_id}")
        assert get_res2.status_code == 404

@pytest.mark.asyncio
async def test_password_protection():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Create with password
        create_res = await ac.post(
            "/api/whisps",
            data={
                "encrypted_payload": "protected",
                "ttl_minutes": 10,
                "password": "securepassword"
            }
        )
        whisp_id = create_res.json()["id"]

        # Get without password (fail 401)
        get_res = await ac.get(f"/api/whisps/{whisp_id}")
        assert get_res.status_code == 401

        # Get with wrong password (fail 401)
        get_res2 = await ac.get(f"/api/whisps/{whisp_id}?password=wrong")
        assert get_res2.status_code == 401

        # Get with correct password (success)
        get_res3 = await ac.get(f"/api/whisps/{whisp_id}?password=securepassword")
        assert get_res3.status_code == 200
        assert get_res3.json()["encrypted_payload"] == "protected"
