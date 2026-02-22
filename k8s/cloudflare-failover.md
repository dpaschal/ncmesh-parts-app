# Cloudflare DNS Failover Configuration

## Overview

`node-parts.paschal.ai` uses Cloudflare Load Balancer with:
- **Primary**: Forge K3s (via Cloudflare Tunnel)
- **Failover**: Cloud Run (GCP, us-east1)

## Setup Steps

### 1. Create Health Check

In Cloudflare Dashboard → Traffic → Health Checks:
- **Name**: ncmesh-parts-forge
- **Type**: HTTP
- **Path**: `/api/parts`
- **Expected codes**: 200
- **Interval**: 60s
- **Consecutive failures before unhealthy**: 2
- **Consecutive passes before healthy**: 1

### 2. Create Origin Pools

**Pool: forge-primary**
- Origin: Cloudflare Tunnel origin for `node-parts.paschal.ai`
- Health Check: ncmesh-parts-forge
- Weight: 1

**Pool: cloudrun-failover**
- Origin: Cloud Run service URL (from `gcloud run services describe ncmesh-parts --region us-east1 --format='value(status.url)'`)
- Health Check: Use default HTTPS check on `/api/parts`
- Weight: 1

### 3. Create Load Balancer

- **Hostname**: `node-parts.paschal.ai`
- **Default pools**: forge-primary
- **Fallback pool**: cloudrun-failover
- **Session affinity**: None
- **Failover threshold**: 1 pool health failure
- **Steering**: Standard failover (not round-robin)

### 4. Test Failover

```bash
# Verify normal operation (should hit forge)
curl -sI https://node-parts.paschal.ai/api/parts | head -5

# Stop pod on forge to trigger failover
ssh paschal@10.0.10.11 "sudo k3s kubectl scale deployment ncmesh-parts -n monitoring --replicas=0"

# Wait 2-3 minutes for health check to fail
sleep 180

# Verify failover to Cloud Run
curl -sI https://node-parts.paschal.ai/api/parts | head -5

# Restore forge
ssh paschal@10.0.10.11 "sudo k3s kubectl scale deployment ncmesh-parts -n monitoring --replicas=1"
```

### 5. Monitoring

Cloudflare dashboard → Traffic → Health Check Analytics shows:
- Health status of each origin
- Failover events
- Response times
