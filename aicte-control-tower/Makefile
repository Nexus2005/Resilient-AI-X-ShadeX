.PHONY: up down logs ps migrate seed test health open

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

migrate:
	docker compose exec api alembic upgrade head

seed:
	docker compose exec api python -m app.seed.seed

test:
	docker compose exec api pytest

health:
	curl -fsS http://localhost:8000/api/v1/health

open:
	@echo "Web: http://localhost:3000"
	@echo "API docs: http://localhost:8000/api/v1/docs"
	@echo "Mailpit: http://localhost:8025"
