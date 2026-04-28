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
