# ─── SUBCULT OPS — Makefile ───

.PHONY: dev build start lint typecheck clean \
        seed seed-policy seed-triggers seed-proactive seed-roundtable seed-relationships \
        verify workers-start workers-stop workers-status workers-logs \
        heartbeat db-migrate help

# ──────────────────────────────────────────
# Development
# ──────────────────────────────────────────

dev: ## Start Next.js dev server
	npm run dev

build: ## Production build
	npm run build

start: ## Start production server
	npm run start

lint: ## Run ESLint
	npm run lint

typecheck: ## Run TypeScript type-checking (no emit)
	npx tsc --noEmit

clean: ## Remove .next build cache
	rm -rf .next

# ──────────────────────────────────────────
# Database
# ──────────────────────────────────────────

db-migrate: ## Run all SQL migrations against DATABASE_URL
	@source .env.local 2>/dev/null; \
	for f in db/migrations/*.sql; do \
		echo "Running $$f..."; \
		psql "$$DATABASE_URL" -f "$$f" 2>&1 | tail -1; \
	done
	@echo "Migrations complete."

# ──────────────────────────────────────────
# Database Seeding
# ──────────────────────────────────────────

seed: ## Run ALL seed scripts in order
	node scripts/go-live/seed-all.mjs

seed-policy: ## Seed core policies
	node scripts/go-live/seed-ops-policy.mjs

seed-triggers: ## Seed reactive trigger rules
	node scripts/go-live/seed-trigger-rules.mjs

seed-proactive: ## Seed proactive triggers (disabled by default)
	node scripts/go-live/seed-proactive-triggers.mjs

seed-roundtable: ## Seed roundtable policies
	node scripts/go-live/seed-roundtable-policy.mjs

seed-relationships: ## Seed agent relationships (10 pairs)
	node scripts/go-live/seed-relationships.mjs

# ──────────────────────────────────────────
# Verification & Monitoring
# ──────────────────────────────────────────

verify: ## Run launch verification checks
	node scripts/go-live/verify-launch.mjs

heartbeat: ## Trigger heartbeat manually (requires CRON_SECRET in .env.local)
	@source .env.local 2>/dev/null; \
	curl -s -H "Authorization: Bearer $$CRON_SECRET" \
		http://localhost:3000/api/ops/heartbeat | \
		node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"

heartbeat-local: ## Alias for heartbeat (same target on VPS)
	@$(MAKE) heartbeat

# ──────────────────────────────────────────
# VPS Workers (systemd)
# ──────────────────────────────────────────

workers-install: ## Copy systemd service files to /etc/systemd/system
	sudo cp deploy/systemd/subcult-*.service /etc/systemd/system/
	sudo systemctl daemon-reload
	@echo "Services installed. Enable with: make workers-start"

workers-start: ## Enable and start all workers
	sudo systemctl enable --now subcult-roundtable subcult-initiative

workers-stop: ## Stop all workers
	sudo systemctl stop subcult-roundtable subcult-initiative

workers-restart: ## Restart all workers
	sudo systemctl restart subcult-roundtable subcult-initiative

workers-status: ## Show status of all workers
	@sudo systemctl status subcult-roundtable --no-pager -l 2>/dev/null || true
	@echo ""
	@sudo systemctl status subcult-initiative --no-pager -l 2>/dev/null || true

workers-logs: ## Tail worker logs (all workers)
	sudo journalctl -u 'subcult-*' -f

logs-roundtable: ## Tail roundtable worker logs
	sudo journalctl -u subcult-roundtable -f

logs-initiative: ## Tail initiative worker logs
	sudo journalctl -u subcult-initiative -f

# ──────────────────────────────────────────
# Local Workers (foreground, for development)
# ──────────────────────────────────────────

run-roundtable: ## Run roundtable worker locally (foreground)
	node scripts/roundtable-worker/worker.mjs

run-initiative: ## Run initiative worker locally (foreground)
	node scripts/initiative-worker/worker.mjs

# ──────────────────────────────────────────
# Help
# ──────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
