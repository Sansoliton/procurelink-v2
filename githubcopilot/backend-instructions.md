# ProcureLink v2 — Backend Copilot Instructions

## Stack
Python 3.11 · FastAPI 0.111 · SQLAlchemy 2 · Alembic · Pydantic v2
PostgreSQL 16 · Celery 5 + Redis · python-jose (JWT) · bcrypt
boto3 (MinIO/S3) · ReportLab · Jinja2 · SlowAPI · Ruff

---

## Project Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI app factory, routers, middleware
│   ├── config.py            # Pydantic Settings (reads from .env)
│   ├── database.py          # SQLAlchemy engine + session factory
│   ├── worker.py            # Celery app + task definitions
│   ├── models/              # SQLAlchemy ORM models (one file per domain)
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # FastAPI route handlers (thin — HTTP only)
│   ├── services/            # Business logic (all state changes go here)
│   ├── repositories/        # DB queries — ALL filter by org_id
│   ├── scripts/             # One-off scripts: seed, migrations
│   └── templates/           # Jinja2 email templates
├── alembic/                 # Migration scripts
├── tests/
│   ├── conftest.py          # pytest fixtures + test DB setup
│   └── test_*.py            # One test file per module
├── requirements.txt
├── alembic.ini
└── Dockerfile
```

### File Naming
- Models: `snake_case.py` matching the table domain — e.g., `requirement.py`
- Repos: `{domain}_repo.py` — e.g., `requirement_repo.py`
- Services: `{domain}_service.py` — e.g., `requirement_service.py`
- Routers: `{domain}s.py` (plural) — e.g., `requirements.py`
- Schemas: `{domain}.py` — mirrors models file

---

## Architecture: Router → Service → Repository → DB

**Strict layering — never skip a layer:**

| Layer | Responsibility | What it must NOT do |
|-------|---------------|---------------------|
| Router | Parse HTTP request, call service, return response | Business logic, DB queries |
| Service | All business logic, authorization checks, transactions | Direct SQLAlchemy queries |
| Repository | DB queries only — always filtered by `org_id` | Business logic, HTTP concerns |
| Model | ORM entity definition | Methods with business logic |

```python
# router calls service only
@router.post("/projects/{project_id}/requirements/", response_model=RequirementOut)
async def create_requirement(
    project_id: str,
    body: RequirementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.create(body, project_id, current_user, db)


# service contains all logic
def create(data: RequirementCreate, project_id: str, user: User, db: Session) -> Requirement:
    project = project_repo.get_by_id(project_id, user.org_id, db)  # 404 if not in org
    _assert_member_role(project_id, user.id, ["buyer", "org-admin"], db)
    return requirement_repo.create(user.org_id, project_id, user.id, data, db)


# repository applies org_id filter on every query
def create(org_id: str, project_id: str, created_by: str, data: RequirementCreate, db: Session) -> Requirement:
    req = Requirement(
        org_id=org_id,
        project_id=project_id,
        created_by=created_by,
        **data.model_dump(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req
```

---

## Tenant Isolation — The Prime Rule

> **Every DB query must include `org_id`. The `org_id` always comes from `current_user.org_id`, never from the request body or URL.**

```python
# GOOD — org_id from current_user
def get_by_id(req_id: str, org_id: str, db: Session) -> Requirement:
    req = db.query(Requirement).filter(
        Requirement.id == req_id,
        Requirement.org_id == org_id,   # ← tenant filter
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req

# BAD — never trust org_id from request body
def get_by_id(req_id: str, org_id: str, db: Session):  # org_id from body → WRONG
    ...
```

### Return 404, not 403, for cross-org resources
This prevents org enumeration attacks — the caller cannot tell whether a resource exists in another org or not at all.

```python
# GOOD
if not req or req.org_id != current_user.org_id:
    raise HTTPException(status_code=404, detail="Not found")

# BAD — leaks existence of resource in another org
if req.org_id != current_user.org_id:
    raise HTTPException(status_code=403, detail="Forbidden")
```

---

## Models — SQLAlchemy 2

```python
# app/models/requirement.py
import uuid
import enum
from datetime import datetime
from sqlalchemy import Column, String, Text, Enum, ForeignKey, DateTime, Float, Integer, Date
from sqlalchemy.orm import relationship
from app.database import Base


class RequirementStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    rfq_sent = "rfq_sent"
    quotes_received = "quotes_received"
    quote_ready = "quote_ready"
    approved = "approved"
    po_raised = "po_raised"
    invoiced = "invoiced"
    completed = "completed"


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organisations.id"), nullable=False, index=True)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    project_name = Column(String(200), nullable=False)
    raw_text = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    status = Column(Enum(RequirementStatus), default=RequirementStatus.draft, nullable=False)
    delivery_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    line_items = relationship("LineItem", back_populates="requirement", cascade="all, delete-orphan")
    project = relationship("Project", back_populates="requirements")


class LineItem(Base):
    __tablename__ = "line_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    requirement_id = Column(String, ForeignKey("requirements.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=False)
    part_number = Column(String(100), nullable=True)
    quantity = Column(Float, nullable=False)
    unit = Column(String(50), nullable=False)
    specs = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    requirement = relationship("Requirement", back_populates="line_items")
```

### Model Conventions
- Always use `String` UUID primary keys with `default=lambda: str(uuid.uuid4())`.
- Always add `org_id` with `index=True` on tenant-scoped tables.
- Use `ondelete="CASCADE"` on child FK columns to keep DB consistent.
- Use `str` enums (`class Status(str, enum.Enum)`) so Pydantic serializes them as strings.
- `created_at` / `updated_at` on every table — use `onupdate=datetime.utcnow` for `updated_at`.

---

## Schemas — Pydantic v2

```python
# app/schemas/requirement.py
from datetime import date, datetime
from pydantic import BaseModel, field_validator
from app.models.requirement import RequirementStatus


class LineItemCreate(BaseModel):
    description: str
    part_number: str | None = None
    quantity: float
    unit: str
    specs: str | None = None
    category: str | None = None
    sort_order: int = 0


class LineItemOut(LineItemCreate):
    id: str
    requirement_id: str

    model_config = {"from_attributes": True}


class RequirementCreate(BaseModel):
    project_name: str
    delivery_date: date | None = None
    raw_text: str | None = None


class RequirementOut(BaseModel):
    id: str
    org_id: str
    project_id: str
    created_by: str
    project_name: str
    status: RequirementStatus
    delivery_date: date | None
    raw_text: str | None
    file_path: str | None
    line_items: list[LineItemOut]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

### Schema Conventions
- **Three schema variants per entity**: `{Entity}Create`, `{Entity}Update`, `{Entity}Out`.
- `{Entity}Out` always includes `id`, `created_at`, `updated_at`, and sets `model_config = {"from_attributes": True}`.
- Never include `org_id` in `Create`/`Update` schemas — it comes from `current_user`.
- Use `str | None = None` (Python 3.10+ union syntax) for optional fields.
- Use `field_validator` for business-rule validation (not type coercion).

```python
# Validator example
@field_validator("quantity")
@classmethod
def quantity_must_be_positive(cls, v: float) -> float:
    if v <= 0:
        raise ValueError("Quantity must be greater than 0")
    return v
```

---

## Routers — FastAPI

```python
# app/routers/requirements.py
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user, require_role
from app.models.user import User
from app.schemas.requirement import RequirementCreate, RequirementOut, LineItemCreate, LineItemOut
from app.services import requirement_service

router = APIRouter(prefix="/projects/{project_id}/requirements", tags=["requirements"])


@router.get("/", response_model=list[RequirementOut])
async def list_requirements(
    project_id: str,
    page: int = 1,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.list_by_project(project_id, page, limit, current_user, db)


@router.post("/", response_model=RequirementOut, status_code=201)
async def create_requirement(
    project_id: str,
    body: RequirementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.create(body, project_id, current_user, db)


@router.get("/{req_id}", response_model=RequirementOut)
async def get_requirement(
    project_id: str,
    req_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.get(req_id, project_id, current_user, db)


@router.put("/{req_id}/items", response_model=list[LineItemOut])
async def edit_line_items(
    project_id: str,
    req_id: str,
    body: list[LineItemCreate],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.edit_line_items(req_id, body, current_user, db)


@router.post("/{req_id}/submit", response_model=RequirementOut)
async def submit_requirement(
    project_id: str,
    req_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return requirement_service.submit(req_id, current_user, db)


@router.post("/{req_id}/upload")
async def upload_file(
    project_id: str,
    req_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_path = requirement_service.upload_file(file, req_id, current_user, db)
    return {"file_path": file_path}
```

### Router Conventions
- Routers are **thin** — no business logic, no DB queries.
- `org_id` is **never** a route parameter — always comes from `current_user`.
- Use `status_code=201` for `POST` that creates a resource.
- Public routes (vendor portal quote submission) skip `get_current_user`.
- Register all routers in `main.py` with `app.include_router(...)`.

---

## Authentication & Dependencies

```python
# app/dependencies.py
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user_id: str = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(*roles: str):
    def check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return check
```

### JWT Token Creation
```python
from datetime import datetime, timedelta
from jose import jwt
from app.config import settings

def create_access_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + timedelta(hours=settings.jwt_expire_hours),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
```

---

## Services — Business Logic

```python
# app/services/requirement_service.py
import re
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.requirement import Requirement, RequirementStatus
from app.repositories import requirement_repo, project_repo
from app.schemas.requirement import RequirementCreate, LineItemCreate
from app.services import storage_service


def create(data: RequirementCreate, project_id: str, user: User, db: Session) -> Requirement:
    project_repo.get_by_id(project_id, user.org_id, db)       # raises 404 if not in org
    _assert_member_has_role(project_id, user.id, ["buyer", "org-admin"], db)
    return requirement_repo.create(user.org_id, project_id, user.id, data, db)


def get(req_id: str, project_id: str, user: User, db: Session) -> Requirement:
    req = requirement_repo.get_by_id(req_id, user.org_id, db)
    if req.project_id != project_id:
        raise HTTPException(status_code=404, detail="Not found")
    return req


def submit(req_id: str, user: User, db: Session) -> Requirement:
    req = requirement_repo.get_by_id(req_id, user.org_id, db)
    if req.status != RequirementStatus.draft:
        raise HTTPException(status_code=400, detail="Only draft requirements can be submitted")
    if not req.line_items:
        raise HTTPException(status_code=400, detail="At least one line item is required")
    for item in req.line_items:
        if not item.description or not item.quantity:
            raise HTTPException(status_code=400, detail="All line items must have description and quantity")
    return requirement_repo.update_status(req_id, RequirementStatus.submitted, user.org_id, db)


def parse_text_to_items(text: str) -> list[LineItemCreate]:
    """Regex parser only — no AI. Splits numbered/bulleted list, extracts qty."""
    items = []
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    qty_pattern = re.compile(
        r"(?:qty[:\s]+|x\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:x\b|ea|each|pcs|units?)",
        re.IGNORECASE,
    )
    unit_pattern = re.compile(r"\b(ea|each|pcs|m|metres?|kg|l|litre|set|units?)\b", re.IGNORECASE)
    list_prefix = re.compile(r"^(?:\d+[.)]\s*|[-*•]\s*)")

    for i, line in enumerate(lines):
        line = list_prefix.sub("", line).strip()
        qty = 1.0
        unit = "ea"
        qty_match = qty_pattern.search(line)
        if qty_match:
            qty = float(qty_match.group(1) or qty_match.group(2))
            line = qty_pattern.sub("", line).strip()
        unit_match = unit_pattern.search(line)
        if unit_match:
            unit = unit_match.group(1).lower()
            line = unit_pattern.sub("", line, count=1).strip()
        items.append(LineItemCreate(description=line, quantity=qty, unit=unit, sort_order=i))
    return items


def upload_file(file: UploadFile, req_id: str, user: User, db: Session) -> str:
    req = requirement_repo.get_by_id(req_id, user.org_id, db)
    path = storage_service.upload(file, f"requirements/{req.org_id}/{req_id}")
    requirement_repo.update_file_path(req_id, path, user.org_id, db)
    return path


def _assert_member_has_role(project_id: str, user_id: str, roles: list[str], db: Session) -> None:
    from app.repositories import project_member_repo
    member = project_member_repo.get(project_id, user_id, db)
    if not member or member.role not in roles:
        raise HTTPException(status_code=403, detail="Insufficient project role")
```

---

## Repositories

```python
# app/repositories/requirement_repo.py
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.models.requirement import Requirement, RequirementStatus, LineItem
from app.schemas.requirement import RequirementCreate, LineItemCreate


def create(org_id: str, project_id: str, created_by: str, data: RequirementCreate, db: Session) -> Requirement:
    req = Requirement(org_id=org_id, project_id=project_id, created_by=created_by, **data.model_dump())
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_by_id(req_id: str, org_id: str, db: Session) -> Requirement:
    req = (
        db.query(Requirement)
        .filter(Requirement.id == req_id, Requirement.org_id == org_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Requirement not found")
    return req


def list_by_project(project_id: str, org_id: str, page: int, limit: int, db: Session) -> list[Requirement]:
    offset = (page - 1) * limit
    return (
        db.query(Requirement)
        .filter(Requirement.project_id == project_id, Requirement.org_id == org_id)
        .order_by(Requirement.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def update_status(req_id: str, status: RequirementStatus, org_id: str, db: Session) -> Requirement:
    req = get_by_id(req_id, org_id, db)
    req.status = status
    db.commit()
    db.refresh(req)
    return req


def update_line_items(req_id: str, items: list[LineItemCreate], org_id: str, db: Session) -> list[LineItem]:
    req = get_by_id(req_id, org_id, db)
    db.query(LineItem).filter(LineItem.requirement_id == req_id).delete()
    new_items = [
        LineItem(requirement_id=req_id, **item.model_dump())
        for item in items
    ]
    db.add_all(new_items)
    db.commit()
    return new_items


def update_file_path(req_id: str, file_path: str, org_id: str, db: Session) -> None:
    req = get_by_id(req_id, org_id, db)
    req.file_path = file_path
    db.commit()
```

### Repository Conventions
- Every method takes `org_id: str` and `db: Session` as explicit parameters.
- Raise `HTTPException(404)` (never 403) when `org_id` filter produces no result.
- Never commit inside a service — commit in the repository at the end of each atomic operation.
- Use `.all()` for lists, `.first()` for single-row lookups (check for `None`).
- For bulk inserts use `db.add_all(items)` over a loop of `db.add()`.

---

## Database Session

```python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## Config — Pydantic Settings

```python
# app/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str
    jwt_expire_hours: int = 24
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "procurelink"
    minio_secure: bool = False
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_from: str = "noreply@procurelink.local"
    allowed_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
```

---

## Celery Tasks

```python
# app/worker.py
from celery import Celery
from app.config import settings

celery_app = Celery(
    "procurelink",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.rfq_tasks", "app.tasks.notification_tasks"],
)

celery_app.conf.beat_schedule = {
    "check-expired-rfqs": {
        "task": "app.tasks.rfq_tasks.check_expired_rfqs",
        "schedule": 3600.0,  # every hour
    },
}
```

```python
# app/tasks/rfq_tasks.py
from app.worker import celery_app
from app.database import SessionLocal
from app.repositories import rfq_repo
from app.models.rfq import RFQStatus


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def send_rfq_emails(self, rfq_ids: list[str], org_id: str):
    db = SessionLocal()
    try:
        for rfq_id in rfq_ids:
            rfq = rfq_repo.get_by_id(rfq_id, org_id, db)
            # send email logic ...
            rfq_repo.update_status(rfq_id, RFQStatus.sent, org_id, db)
    except Exception as exc:
        raise self.retry(exc=exc)
    finally:
        db.close()


@celery_app.task
def check_expired_rfqs():
    from datetime import datetime
    db = SessionLocal()
    try:
        expired = rfq_repo.list_expired(datetime.utcnow(), db)
        for rfq in expired:
            rfq_repo.update_status(rfq.id, RFQStatus.expired, rfq.org_id, db)
    finally:
        db.close()
```

### Task Conventions
- Always open and close a **new** `SessionLocal()` inside the task — never share a session across tasks.
- Use `bind=True, max_retries=3` on tasks that call external services (email, S3).
- Enqueue tasks by calling `.delay(...)` from services, never from routers.
- Beat tasks go in `celery_app.conf.beat_schedule` in `worker.py`.

---

## File Storage — MinIO/S3

```python
# app/services/storage_service.py
import boto3
from botocore.exceptions import ClientError
from fastapi import UploadFile, HTTPException
from app.config import settings

_client = boto3.client(
    "s3",
    endpoint_url=f"{'https' if settings.minio_secure else 'http'}://{settings.minio_endpoint}",
    aws_access_key_id=settings.minio_access_key,
    aws_secret_access_key=settings.minio_secret_key,
)


def upload(file: UploadFile, key_prefix: str) -> str:
    key = f"{key_prefix}/{file.filename}"
    try:
        _client.upload_fileobj(file.file, settings.minio_bucket, key)
    except ClientError as exc:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {exc}")
    return key


def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    return _client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.minio_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
```

---

## Email Service

```python
# app/services/email_service.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from jinja2 import Environment, FileSystemLoader
from app.config import settings

_jinja = Environment(loader=FileSystemLoader("app/templates"))


def send(to: str, subject: str, template: str, context: dict) -> None:
    html = _jinja.get_template(template).render(**context)
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
        smtp.sendmail(settings.smtp_from, to, msg.as_string())
```

Never call `email_service.send()` directly from a router or in the same request cycle. Always enqueue via a Celery task so HTTP latency stays low.

---

## Alembic Migrations

```bash
# Create a new migration after model changes
alembic revision --autogenerate -m "add_line_items_table"

# Apply all pending migrations
alembic upgrade head

# Roll back one step
alembic downgrade -1
```

### Migration Conventions
- One migration per logical change (one table, one column, one index).
- Always review autogenerated `upgrade()` — Alembic misses some changes (ENUMs, complex constraints).
- Add DB-level constraints in migrations, not just at the ORM level.
- Name migrations descriptively: `add_org_id_index_to_requirements`, not `auto_20240101`.

```python
# Example migration — add index on hot query column
def upgrade() -> None:
    op.create_index("ix_requirements_org_id_project_id", "requirements", ["org_id", "project_id"])

def downgrade() -> None:
    op.drop_index("ix_requirements_org_id_project_id", table_name="requirements")
```

---

## Error Handling

```python
# Raise HTTPException from services and repositories — FastAPI converts to JSON
raise HTTPException(status_code=400, detail="Only draft requirements can be submitted")
raise HTTPException(status_code=404, detail="Requirement not found")
raise HTTPException(status_code=403, detail="Insufficient permissions")
raise HTTPException(status_code=409, detail="Email already registered")

# Global exception handler for unexpected errors (register in main.py)
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # log exc here
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
```

### HTTP Status Code Reference
| Situation | Code |
|-----------|------|
| Resource not found (incl. cross-org) | 404 |
| Validation / bad state transition | 400 |
| Unauthenticated | 401 |
| Authenticated but wrong role | 403 |
| Duplicate / conflict | 409 |
| Created | 201 |

---

## Testing

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

TEST_DB_URL = "postgresql://test:test@localhost/test_db"
engine = create_engine(TEST_DB_URL)
TestingSessionLocal = sessionmaker(bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

```python
# tests/test_requirements.py
def test_create_requirement_requires_buyer_role(client, auth_headers_viewer):
    res = client.post(
        "/projects/proj-1/requirements/",
        json={"project_name": "Test", "delivery_date": "2025-06-01"},
        headers=auth_headers_viewer,
    )
    assert res.status_code == 403

def test_cross_org_requirement_returns_404(client, auth_headers_org_a, req_org_b_id):
    res = client.get(f"/projects/proj-1/requirements/{req_org_b_id}", headers=auth_headers_org_a)
    assert res.status_code == 404
```

### Testing Conventions
- Use a **real test database** — never mock `get_db` with in-memory SQLite (schema differences cause false passes).
- One test file per router module.
- Always test: auth required, role enforcement, cross-org isolation (404).
- Use `factory-boy` factories for fixtures — don't build model instances manually.
- Run with `pytest -x --tb=short tests/`.

---

## Rate Limiting

```python
# app/main.py — attach SlowAPI limiter
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# On sensitive routes
@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    ...
```

---

## Monitoring

```python
# app/main.py
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

All custom metrics go in `app/metrics.py` using `prometheus_client` counters/histograms. Prefix with `procurelink_`.

---

## main.py — App Factory

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import auth, projects, requirements, vendors, rfqs, quotations, pos, invoices, analytics, notifications

app = FastAPI(title="ProcureLink API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in [auth.router, projects.router, requirements.router, vendors.router,
               rfqs.router, quotations.router, pos.router, invoices.router,
               analytics.router, notifications.router]:
    app.include_router(router, prefix="/api")
```

---

## Do Not

- Do not put business logic in routers — it belongs in services.
- Do not query the DB in services directly — call repository methods.
- Do not accept `org_id` from request body or URL params — always use `current_user.org_id`.
- Do not return 403 when the resource belongs to another org — return 404.
- Do not share a `Session` across Celery tasks.
- Do not commit inside a service — the repository owns the commit.
- Do not use `db.query(Model).all()` without an `org_id` filter on tenant-scoped tables.
- Do not call `email_service.send()` in the request cycle — always enqueue via Celery.
- Do not use `print()` — use Python `logging` module.
- Do not expose internal error details to clients — log them server-side and return a generic message.
