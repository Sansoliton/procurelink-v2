from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import engine, Base
from app.routers import (
    auth_router, projects_router, vendors_router,
    requirements_router, rfqs_router, quotes_router,
    notifications_router, analytics_router, health_router,
    customers_router, cquotes_router, cinvoices_router,
    logos_router, org_router,
)

# SQLite local dev: auto-create tables without running Alembic.
# On Postgres (production) start.sh runs `alembic upgrade head` before uvicorn.
if settings.database_url.startswith("sqlite"):
    Base.metadata.create_all(bind=engine)

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="ProcureLink API",
    description="Multi-tenant B2B procurement platform",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
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

@app.get("/")
def root():
    return {"app": "ProcureLink", "version": "2.0.0", "docs": "/docs"}
