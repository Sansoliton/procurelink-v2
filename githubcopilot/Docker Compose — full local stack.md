Create the complete docker-compose.yml for ProcureLink local development.

Services to include:
1. api — FastAPI backend
   build: ./backend
   ports: 8000:8000
   env: DATABASE_URL, REDIS_URL, MINIO_ENDPOINT, SMTP_HOST=mailhog, SMTP_PORT=1025
   depends_on: db, redis, minio, mailhog
   volumes: ./backend:/app (hot reload)
   command: uvicorn app.main:app --reload --host 0.0.0.0

2. worker — Celery worker
   build: ./backend (same image)
   command: celery -A app.worker worker --loglevel=info -Q default,emails,pdfs
   depends_on: db, redis

3. beat — Celery Beat scheduler
   command: celery -A app.worker beat --loglevel=info
   depends_on: redis

4. flower — Celery monitoring UI
   command: celery -A app.worker flower --port=5555
   ports: 5555:5555

5. db — PostgreSQL 16
   image: postgres:16-alpine
   ports: 5432:5432
   volumes: postgres_data:/var/lib/postgresql/data
   env: POSTGRES_DB=procurelink, POSTGRES_USER=proc, POSTGRES_PASSWORD=proc

6. redis — Redis 7
   image: redis:7-alpine
   ports: 6379:6379

7. minio — S3-compatible storage
   image: minio/minio
   ports: 9000:9000, 9001:9001 (console)
   command: server /data --console-address ":9001"
   env: MINIO_ROOT_USER=minioadmin, MINIO_ROOT_PASSWORD=minioadmin
   volumes: minio_data:/data

8. mailhog — Email testing
   image: mailhog/mailhog
   ports: 1025:1025 (SMTP), 8025:8025 (Web UI)

9. prometheus — Metrics collection
   image: prom/prometheus
   ports: 9090:9090
   volumes: ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

10. grafana — Metrics dashboards
    image: grafana/grafana
    ports: 3001:3000
    depends_on: prometheus

Also create:
- frontend/vite.config.ts: proxy /api → http://localhost:8000
- backend/.env.example with all service URLs
- monitoring/prometheus.yml scraping FastAPI /metrics
- Makefile with commands:
  make up     → docker-compose up -d
  make down   → docker-compose down
  make logs   → docker-compose logs -f api worker
  make migrate → docker-compose exec api alembic upgrade head
  make test    → docker-compose exec api pytest
  make shell   → docker-compose exec api python

Show all files in full including Makefile.