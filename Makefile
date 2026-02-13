# ─── SUBCULT OPS — Makefile ───

.PHONY: dev build start lint typecheck clean \
        seed seed-policy seed-triggers seed-proactive seed-roundtable seed-relationships \
        verify up down restart status logs logs-app logs-roundtable logs-initiative logs-mission \
        heartbeat db-migrate db-shell help

# ──────────────────────────────────────────
# Development
# ──────────────────────────────────────────

dev: ## Start Next.js dev server
	npm run dev

build: ## Production build (local)
	npm run build

start: ## Start production server (local)
	npm run start

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type-checking (no emit)
	npx tsc --noEmit

clean: ## Remove .next build cache
	rm -rf .next

# ──────────────────────────────────────────
# Docker — Full Stack
# ──────────────────────────────────────────

up: ## Build and start all containers
	docker compose up -d --build

down: ## Stop all containers
	docker compose down

restart: ## Restart all containers
	docker compose restart

rebuild: ## Rebuild images and recreate containers
	docker compose up -d --build --force-recreate

status: ## Show status of all containers
	docker compose ps

# ──────────────────────────────────────────
# Docker — Logs
# ──────────────────────────────────────────

logs: ## Tail logs from all containers
	docker compose logs -f --tail=50

logs-app: ## Tail app container logs
	docker compose logs -f --tail=50 app

logs-roundtable: ## Tail roundtable worker logs
	docker compose logs -f --tail=50 roundtable-worker

logs-initiative: ## Tail initiative worker logs
	docker compose logs -f --tail=50 initiative-worker

logs-mission: ## Tail mission worker logs
	docker compose logs -f --tail=50 mission-worker

logs-db: ## Tail Postgres logs
	docker compose logs -f --tail=50 postgres

# ──────────────────────────────────────────
# Database
# ──────────────────────────────────────────

db-migrate: ## Run all SQL migrations against the container DB
	@for f in db/migrations/*.sql; do \
		echo "Running $$f..."; \
		docker compose exec -T postgres psql -U subcult -d subcult_ops -f - < "$$f" 2>&1 | tail -1; \
	done
	@echo "Migrations complete."

db-shell: ## Open psql shell in the Postgres container
	docker compose exec postgres psql -U subcult -d subcult_ops

# ──────────────────────────────────────────
# Database Seeding
# ──────────────────────────────────────────

DB_URL := postgresql://subcult:$(shell grep POSTGRES_PASSWORD .env.local | cut -d= -f2)@127.0.0.1:5433/subcult_ops

seed: ## Run ALL seed scripts in order
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-all.mjs

seed-policy: ## Seed core policies
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-ops-policy.mjs

seed-triggers: ## Seed reactive trigger rules
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-trigger-rules.mjs

seed-proactive: ## Seed proactive triggers (disabled by default)
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-proactive-triggers.mjs

seed-roundtable: ## Seed roundtable policies
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-roundtable-policy.mjs

seed-relationships: ## Seed agent relationships (15 pairs)
	DATABASE_URL="$(DB_URL)" node scripts/go-live/seed-relationships.mjs

# ──────────────────────────────────────────
# Verification & Monitoring
# ──────────────────────────────────────────

verify: ## Run launch verification checks
	DATABASE_URL="$(DB_URL)" node scripts/go-live/verify-launch.mjs

heartbeat: ## Trigger heartbeat (via Docker internal network)
	@CRON_SECRET=$$(grep CRON_SECRET .env.local 2>/dev/null | cut -d= -f2); \
	docker compose exec app wget -qO- \
		--header="Authorization: Bearer $$CRON_SECRET" \
		http://127.0.0.1:3000/api/ops/heartbeat | \
		python3 -m json.tool

heartbeat-ext: ## Trigger heartbeat (via external URL)
	@CRON_SECRET=$$(grep CRON_SECRET .env.local 2>/dev/null | cut -d= -f2); \
	curl -s -H "Authorization: Bearer $$CRON_SECRET" \
		https://subcorp.subcult.tv/api/ops/heartbeat | \
		python3 -m json.tool

# ──────────────────────────────────────────
# Help
# ──────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
