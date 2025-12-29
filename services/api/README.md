# DocSense API

Go (Gin) backend service for DocSense.

## What it does
- Health endpoint: `GET /health`
- Document upload (PDF) + metadata persistence scaffold

## Run locally
```bash
# Requires Go installed
go test ./...

# Run
go run ./cmd/api
```

## Env
- Primary settings are read from environment variables.
- See infra/compose/env/api.env.example for a complete local set.
