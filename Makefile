.PHONY: up down logs migrate seed test lint shell frontend

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f api worker

migrate:
	docker-compose exec api alembic upgrade head

seed:
	docker-compose exec api python -m app.scripts.seed_demo

test:
	docker-compose exec api pytest tests/ -v

lint:
	docker-compose exec api ruff check app/

shell:
	docker-compose exec api python

psql:
	docker-compose exec db psql -U proc -d procurelink

reset-db:
	docker-compose down -v
	docker-compose up -d db redis
	sleep 3
	docker-compose up -d api worker beat
	sleep 5
	$(MAKE) migrate
	$(MAKE) seed

frontend:
	cd frontend && npm run dev

# ── Production (Docker Hub images, no Render) ─────────────────────
# 1. cp .env.example .env  — then edit DOCKERHUB_USERNAME, passwords, etc.
# 2. make prod-pull        — pull latest images from Docker Hub
# 3. make prod-up          — start all services

prod-pull:
	docker compose -f docker-compose.prod.yml pull

prod-up:
	docker compose -f docker-compose.prod.yml up -d

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f api worker

prod-migrate:
	docker compose -f docker-compose.prod.yml exec api alembic upgrade head

# Build images locally (without pushing) for self-hosted use
prod-build-local:
	docker build -t procurelink-backend:local ./backend
	docker build -t procurelink-frontend:local ./frontend

