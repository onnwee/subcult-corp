# SUBCULT OPS — Deployment

## Docker-based deployment (current)

All workers now run as a unified Docker container via `docker compose`.

```bash
# Build and start all containers (postgres, app, worker, toolbox)
make up

# Check status
make status

# View logs
make logs-worker
```

See the root `Makefile` and `docker-compose.yml` for full details.

## Legacy

The old systemd-based per-worker deployment (subcult-roundtable, subcult-initiative,
subcult-step-worker) has been retired. All worker functionality is now handled by
the unified worker container.
