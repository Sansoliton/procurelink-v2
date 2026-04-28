import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db

# Use SQLite in-memory for tests
TEST_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base.metadata.create_all(bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] in ("ok", "degraded")


def test_register_and_login():
    r = client.post("/auth/register", json={
        "org_name": "Test Org", "email": "test@test.com", "password": "pass1234"
    })
    assert r.status_code == 200
    token = r.json()["access_token"]
    assert token

    r2 = client.post("/auth/login", json={"email": "test@test.com", "password": "pass1234"})
    assert r2.status_code == 200


def test_me_requires_auth():
    r = client.get("/auth/me")
    assert r.status_code == 403


def test_create_project():
    # Register
    r = client.post("/auth/register", json={
        "org_name": "Proj Org", "email": "proj@test.com", "password": "pass1234"
    })
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r2 = client.post("/projects/", json={"name": "Test Project"}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["name"] == "Test Project"


def test_create_requirement_with_parser():
    r = client.post("/auth/register", json={
        "org_name": "Req Org", "email": "req@test.com", "password": "pass1234"
    })
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    proj = client.post("/projects/", json={"name": "Req Project"}, headers=headers).json()
    project_id = proj["id"]

    r2 = client.post(
        f"/projects/{project_id}/requirements/",
        json={
            "title": "Test requirement",
            "raw_text": "50x stainless steel flanges DN50\n200 hex bolts M12x60\n10m pipe schedule 40",
        },
        headers=headers,
    )
    assert r2.status_code == 200
    data = r2.json()
    assert len(data["line_items"]) == 3
    assert data["line_items"][0]["quantity"] == 50.0
