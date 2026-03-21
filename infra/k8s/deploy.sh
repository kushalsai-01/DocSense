#!/usr/bin/env bash
set -euo pipefail

echo "Deploying DocSense to Kubernetes..."

# Namespace first
kubectl apply -f infra/k8s/00-namespace.yaml

# Secrets (user must copy 01-secrets.yaml.example → 01-secrets.yaml and fill in values)
if [ ! -f infra/k8s/01-secrets.yaml ]; then
  echo "ERROR: infra/k8s/01-secrets.yaml not found."
  echo "Copy infra/k8s/01-secrets.yaml.example → infra/k8s/01-secrets.yaml and fill in values."
  exit 1
fi
kubectl apply -f infra/k8s/01-secrets.yaml

# Stateful dependencies
kubectl apply -f infra/k8s/02-postgres.yaml
kubectl apply -f infra/k8s/03-redis.yaml
kubectl apply -f infra/k8s/04-qdrant.yaml

echo "Waiting for databases to be ready..."
kubectl rollout status statefulset/postgres -n docsense --timeout=120s
kubectl rollout status statefulset/redis    -n docsense --timeout=60s
kubectl rollout status statefulset/qdrant   -n docsense --timeout=120s

# AI services
kubectl apply -f infra/k8s/05-rag-service.yaml
kubectl apply -f infra/k8s/06-agent-service.yaml

echo "Waiting for AI services..."
kubectl rollout status deployment/rag-service   -n docsense --timeout=180s
kubectl rollout status deployment/agent-service -n docsense --timeout=180s

# Application layer
kubectl apply -f infra/k8s/07-api.yaml
kubectl apply -f infra/k8s/08-web.yaml
kubectl apply -f infra/k8s/09-ingress.yaml

echo "Waiting for application..."
kubectl rollout status deployment/api -n docsense --timeout=120s
kubectl rollout status deployment/web -n docsense --timeout=60s

echo ""
echo "DocSense deployed successfully!"
echo ""
kubectl get pods -n docsense
