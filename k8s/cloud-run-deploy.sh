#!/usr/bin/env bash
# Cloud Run deployment script for ncmesh-parts v2 (failover)
# Run from the project root directory on a machine with gcloud configured.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project paschal-homelab

set -euo pipefail

PROJECT_ID="paschal-homelab"
REGION="us-east1"
IMAGE="gcr.io/${PROJECT_ID}/ncmesh-parts:v2"
SERVICE="ncmesh-parts"

echo "Building and submitting to Cloud Build..."
gcloud builds submit --tag "${IMAGE}" .

echo "Deploying to Cloud Run..."
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "RESEND_API_KEY=${RESEND_API_KEY:-}" \
  --port 3000 \
  --memory 256Mi \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 30

echo ""
echo "Cloud Run URL:"
gcloud run services describe "${SERVICE}" --region "${REGION}" --format='value(status.url)'
