import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from sqlalchemy import text, inspect
from app.config import settings
from app.database import engine, Base
from app.routers import (
    auth_router, projects_router, vendors_router,
    requirements_router, rfqs_router, quotes_router,
    notifications_router, analytics_router, health_router,
    customers_router, cquotes_router, cinvoices_router,
    logos_router, org_router, delivery_notes_router,
)

# Create all tables (new ones only — existing tables are not touched).
Base.metadata.create_all(bind=engine)

# ── Safe column migrations ─────────────────────────────────────────
# create_all() skips tables that already exist, so new columns on existing
# tables must be added explicitly. We use try/except so re-running is safe.
_COLUMN_MIGRATIONS = [
    # (table, column, definition)
    # customers — columns added after initial migration
    ("customers", "trn",        "VARCHAR(50)"),
    ("customers", "logo_image", "TEXT"),
    ("customers", "logo_url",   "VARCHAR(500)"),
    ("customers", "updated_at", "TIMESTAMP"),
    # customer_quotations / invoices
    ("customer_quotations", "pdf_url",      "VARCHAR"),
    ("customer_quotations", "customer_id",  "VARCHAR"),
    ("customer_invoices",   "pdf_url",      "VARCHAR"),
    ("customer_invoices",   "customer_id",  "VARCHAR"),
    ("customer_invoices",   "quotation_no", "VARCHAR(50)"),  # used in /related filter
    # delivery_notes (handled by create_all but listed for safety)
]

def _add_column_if_missing(table: str, column: str, definition: str) -> None:
    inspector = inspect(engine)
    existing = [c["name"] for c in inspector.get_columns(table)]
    if column not in existing:
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))

for _table, _col, _def in _COLUMN_MIGRATIONS:
    try:
        _add_column_if_missing(_table, _col, _def)
    except Exception as _exc:
        import logging as _log
        _log.getLogger(__name__).warning("Column migration skipped (%s.%s): %s", _table, _col, _exc)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="QuoteMe API",
    description="Multi-tenant B2B procurement platform",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    root_path="/api",
    root_path_in_servers=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
_cors_origins = {
    settings.frontend_url,
    "http://localhost:5173",
    "http://localhost:3000",
    *[o.strip() for o in settings.allowed_origins.split(",") if o.strip()],
}
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
Instrumentator().instrument(app).expose(app)

# Routes
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(vendors_router)
app.include_router(requirements_router)
app.include_router(rfqs_router)
app.include_router(quotes_router)
app.include_router(notifications_router)
app.include_router(analytics_router)
app.include_router(health_router)
app.include_router(customers_router)
app.include_router(cquotes_router)
app.include_router(cinvoices_router)
app.include_router(logos_router)
app.include_router(org_router)
app.include_router(delivery_notes_router)

# Serve uploaded files — mount after routes so /files/* doesn't shadow anything
os.makedirs(settings.upload_dir, exist_ok=True)
app.mount("/files", StaticFiles(directory=settings.upload_dir), name="uploads")

@app.get("/")
def root():
    return {"app": "QuoteMe", "version": "2.0.0", "docs": "/docs"}
