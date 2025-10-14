# Docker Deployment Guide

This guide covers containerized deployment of the EasyEscrow.ai backend API using Docker and Docker Compose.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Building the Docker Image](#building-the-docker-image)
- [Running with Docker Compose](#running-with-docker-compose)
- [Production Deployment](#production-deployment)
- [Health Checks and Monitoring](#health-checks-and-monitoring)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Troubleshooting](#troubleshooting)

## Overview

The EasyEscrow.ai backend is containerized using a multi-stage Dockerfile that:

- **Builder Stage**: Compiles TypeScript and generates Prisma Client
- **Production Stage**: Creates a lean runtime image with only production dependencies
- **Security**: Runs as non-root user, includes minimal attack surface
- **Health Checks**: Built-in health check endpoint for orchestration

## Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ installed
- Basic understanding of Docker and containerization
- Access to:
  - PostgreSQL database (or use the included Docker Compose service)
  - Redis instance (or use the included Docker Compose service)
  - Solana RPC endpoint

## Environment Configuration

### Required Environment Variables

The application requires the following environment variables:

#### Server Configuration
```bash
NODE_ENV=production          # Environment: development, staging, production
PORT=3000                    # Server port (default: 3000)
```

#### Database Configuration
```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname?schema=public
```

#### Redis Configuration
```bash
REDIS_HOST=redis             # Redis host
REDIS_PORT=6379              # Redis port
REDIS_PASSWORD=              # Redis password (optional)
REDIS_DB=0                   # Redis database number
REDIS_TLS=false              # Enable TLS for Redis
```

#### Solana Configuration
```bash
SOLANA_RPC_URL=https://api.devnet.solana.com    # Solana RPC endpoint
SOLANA_COMMITMENT=confirmed                      # Commitment level
SOLANA_NETWORK=devnet                           # Network: devnet, mainnet-beta
ESCROW_PROGRAM_ID=<your_program_id>             # Deployed escrow program ID
USDC_MINT_ADDRESS=<usdc_mint_address>           # USDC token mint address
```

#### API Keys and Authentication
```bash
JWT_SECRET=your_jwt_secret_min_32_chars         # JWT signing secret
API_KEY=your_api_key_here                       # API authentication key
```

#### Monitoring and Background Jobs
```bash
MONITORING_ENABLED=true                         # Enable deposit monitoring
MONITORING_INTERVAL_MS=30000                    # Monitoring check interval
EXPIRY_CHECK_INTERVAL_MS=60000                  # Expiry check interval
AUTO_PROCESS_REFUNDS=true                       # Auto-process refunds
IDEMPOTENCY_EXPIRATION_HOURS=24                 # Idempotency key TTL
```

#### Security and CORS
```bash
ALLOWED_ORIGINS=http://localhost:3000           # Comma-separated allowed origins
HELMET_ENABLED=true                             # Enable Helmet security headers
CORS_ENABLED=true                               # Enable CORS
```

### Managing Secrets

**For Development:**
- Use `.env` file (not committed to Git)
- Copy from `.env.example` and fill in values

**For Production:**
- Use Docker secrets
- Use external secret management (AWS Secrets Manager, HashiCorp Vault, etc.)
- Use Kubernetes secrets
- Never commit secrets to version control

## Building the Docker Image

### Build the image

```bash
docker build -t easyescrow-backend:latest .
```

### Build with specific Node environment

```bash
docker build --build-arg NODE_ENV=production -t easyescrow-backend:prod .
```

### View build layers and size

```bash
docker images easyescrow-backend:latest
docker history easyescrow-backend:latest
```

## Running with Docker Compose

### Start all services (backend, PostgreSQL, Redis)

```bash
docker-compose up -d
```

### View logs

```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Postgres only
docker-compose logs -f postgres
```

### Stop services

```bash
docker-compose down
```

### Stop and remove volumes (database data)

```bash
docker-compose down -v
```

### Run database migrations

```bash
# Inside the running container
docker-compose exec backend npx prisma migrate deploy

# Or during deployment
docker-compose run --rm backend npx prisma migrate deploy
```

## Production Deployment

### 1. Build Production Image

```bash
docker build \
  --build-arg NODE_ENV=production \
  --tag easyescrow-backend:v1.0.0 \
  --tag easyescrow-backend:latest \
  .
```

### 2. Tag and Push to Registry

```bash
# Tag for your registry
docker tag easyescrow-backend:v1.0.0 your-registry.com/easyescrow-backend:v1.0.0

# Push to registry
docker push your-registry.com/easyescrow-backend:v1.0.0
docker push your-registry.com/easyescrow-backend:latest
```

### 3. Run Production Container

```bash
docker run -d \
  --name easyescrow-backend \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_HOST="redis" \
  -e SOLANA_RPC_URL="https://api.mainnet-beta.solana.com" \
  -e JWT_SECRET="your_secure_secret" \
  --network your-network \
  your-registry.com/easyescrow-backend:v1.0.0
```

### 4. Production Best Practices

- **Use secrets management**: Don't pass secrets via `-e` flags
- **Enable resource limits**: Set CPU and memory limits
- **Configure restart policies**: Use `--restart unless-stopped` or `--restart always`
- **Use health checks**: Leverage the built-in HEALTHCHECK
- **Enable logging**: Configure log drivers for centralized logging
- **Monitor container**: Use monitoring tools (Prometheus, Datadog, etc.)
- **Regular updates**: Keep base images and dependencies updated
- **Backup strategy**: Regular database backups

## Health Checks and Monitoring

### Health Check Endpoint

The application includes a comprehensive health check at `/health`:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "service": "easy-escrow-ai-backend",
  "database": "connected",
  "redis": "connected",
  "monitoring": {
    "status": "running",
    "monitoredAccounts": 5,
    "uptime": "120 minutes",
    "restartCount": 0,
    "solanaHealthy": true
  },
  "expiryCancellation": {
    "status": "running",
    "services": { ... }
  },
  "idempotency": {
    "status": "running",
    "expirationHours": 24
  }
}
```

### Docker Health Check

The Dockerfile includes a `HEALTHCHECK` instruction:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "..." || exit 1
```

View container health:
```bash
docker ps
docker inspect --format='{{.State.Health.Status}}' easyescrow-backend
```

### Monitoring Container Metrics

```bash
# View resource usage
docker stats easyescrow-backend

# View logs
docker logs -f easyescrow-backend

# Execute commands in container
docker exec -it easyescrow-backend sh
```

## Kubernetes Deployment

### Deployment Example

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: easyescrow-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: easyescrow-backend
  template:
    metadata:
      labels:
        app: easyescrow-backend
    spec:
      containers:
      - name: backend
        image: your-registry.com/easyescrow-backend:v1.0.0
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: easyescrow-secrets
              key: database-url
        - name: REDIS_HOST
          value: "redis-service"
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        # Readiness probe - when pod is ready to receive traffic
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 40
          periodSeconds: 10
          timeoutSeconds: 5
          successThreshold: 1
          failureThreshold: 3
        # Liveness probe - when to restart pod
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 10
          successThreshold: 1
          failureThreshold: 3
        # Startup probe - during initial startup
        startupProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 12
---
apiVersion: v1
kind: Service
metadata:
  name: easyescrow-backend
spec:
  selector:
    app: easyescrow-backend
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

### Kubernetes Secrets

```bash
# Create secrets
kubectl create secret generic easyescrow-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=jwt-secret="..." \
  --from-literal=redis-password="..."

# Apply deployment
kubectl apply -f k8s-deployment.yaml

# Check pod status
kubectl get pods -l app=easyescrow-backend

# View logs
kubectl logs -f deployment/easyescrow-backend

# Check health
kubectl port-forward deployment/easyescrow-backend 3000:3000
curl http://localhost:3000/health
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker logs easyescrow-backend

# Common issues:
# - Database connection failed: Check DATABASE_URL
# - Redis connection failed: Check REDIS_HOST/PORT
# - Missing environment variables: Check all required env vars
# - Port already in use: Change port mapping
```

### Health Check Failing

```bash
# Check health endpoint manually
docker exec easyescrow-backend curl http://localhost:3000/health

# Check if services are running
docker-compose ps

# Verify environment variables
docker exec easyescrow-backend env | grep -E "DATABASE|REDIS|SOLANA"
```

### Database Connection Issues

```bash
# Test database connection from container
docker exec easyescrow-backend npx prisma db pull

# Check if postgres is accessible
docker-compose exec backend ping postgres

# Verify DATABASE_URL format
docker-compose exec backend echo $DATABASE_URL
```

### Performance Issues

```bash
# Check resource usage
docker stats easyescrow-backend

# Increase memory limit in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 4G

# Check logs for memory errors
docker logs easyescrow-backend | grep -i "memory\|heap"
```

### Debugging Inside Container

```bash
# Get shell access
docker exec -it easyescrow-backend sh

# Check Node.js version
node --version

# Check if dist folder exists
ls -la dist/

# Check environment
env | sort

# Test health endpoint
curl http://localhost:3000/health
```

## Additional Resources

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prisma in Docker](https://www.prisma.io/docs/guides/deployment/docker)

## Support

For issues and questions:
- Check application logs
- Review health check output
- Consult main README.md
- Review API documentation

---

**Last Updated**: January 2025
**Version**: 1.0.0

