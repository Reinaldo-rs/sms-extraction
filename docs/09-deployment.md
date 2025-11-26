# 09 - Deployment (Deploy e Infraestrutura)

> **Navegação:** [← Database Schema](08-database-schema.md) | [Troubleshooting →](10-troubleshooting.md)

---

## 📑 Índice

1. [Requisitos](#requisitos)
2. [Docker Setup](#docker-setup)
3. [Production Deploy](#production-deploy)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Monitoramento](#monitoramento)
6. [Scaling](#scaling)

---

## 💻 Requisitos

### Hardware Mínimo

| Componente | Desenvolvimento | Produção |
|------------|-----------------|----------|
| **CPU** | 2 cores | 4 cores |
| **RAM** | 4 GB | 8 GB |
| **Disco** | 10 GB | 50 GB SSD |
| **GPU** | Opcional | Recomendado para OCR |

### Software

```bash
# Node.js
node >= 18.0.0
npm >= 9.0.0

# Python (para OCR services)
python >= 3.8

# Database
sqlite3 >= 3.35.0

# Cache
redis >= 6.0

# Container (opcional)
docker >= 20.10
docker-compose >= 2.0
```

---

## 🐳 Docker Setup

### Estrutura

```
project/
├── Dockerfile                    # App Node.js
├── docker-compose.yml
└── python-services/
    ├── easyocr-service/
    │   └── Dockerfile
    └── paddleocr-service/
        └── Dockerfile
```

### Dockerfile (App Principal)

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create data directories
RUN mkdir -p /app/data/models /app/data/training /app/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js || exit 1

# Start application
CMD ["node", "main.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  # Aplicação principal Node.js
  app:
    build: .
    container_name: sms-extraction-app
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      REDIS_URL: redis://redis:6379
      EASYOCR_URL: http://easyocr:5001
      PADDLEOCR_URL: http://paddleocr:5002
      DATABASE_PATH: /app/data/extractions.db
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    depends_on:
      - redis
      - easyocr
      - paddleocr
    restart: unless-stopped
    networks:
      - sms-network

  # Redis (Cache)
  redis:
    image: redis:7-alpine
    container_name: sms-extraction-redis
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped
    networks:
      - sms-network

  # EasyOCR Service
  easyocr:
    build: ./python-services/easyocr-service
    container_name: sms-extraction-easyocr
    ports:
      - "5001:5001"
    environment:
      FLASK_ENV: production
      WORKERS: 2
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    restart: unless-stopped
    networks:
      - sms-network

  # PaddleOCR Service
  paddleocr:
    build: ./python-services/paddleocr-service
    container_name: sms-extraction-paddleocr
    ports:
      - "5002:5002"
    environment:
      FLASK_ENV: production
      WORKERS: 2
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 1G
    restart: unless-stopped
    networks:
      - sms-network

  # Nginx (Reverse Proxy)
  nginx:
    image: nginx:alpine
    container_name: sms-extraction-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped
    networks:
      - sms-network

volumes:
  redis-data:

networks:
  sms-network:
    driver: bridge
```

### nginx.conf

```nginx
events {
    worker_connections 1024;
}

http {
    upstream app {
        server app:3000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=extract_limit:10m rate=10r/m;

    server {
        listen 80;
        server_name sms-extraction.example.com;

        # Redirect to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name sms-extraction.example.com;

        # SSL certificates
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;

        # SSL configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;
        ssl_prefer_server_ciphers on;

        # Max upload size (10MB)
        client_max_body_size 10M;

        # API endpoints
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
            
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # Extract endpoint (mais restritivo)
        location /api/v1/extract {
            limit_req zone=extract_limit burst=5 nodelay;
            
            proxy_pass http://app;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            
            # Timeout maior para processamento
            proxy_read_timeout 120s;
        }

        # Health check
        location /health {
            proxy_pass http://app/api/v1/health;
            access_log off;
        }

        # Static files
        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
    }
}
```

### Comandos Docker

```bash
# Build e iniciar
docker-compose up -d --build

# Ver logs
docker-compose logs -f app

# Parar
docker-compose down

# Parar e remover volumes
docker-compose down -v

# Rebuild específico
docker-compose up -d --build app

# Escalar serviços
docker-compose up -d --scale app=3

# Executar comando no container
docker-compose exec app node scripts/migrate.js

# Ver status
docker-compose ps

# Ver uso de recursos
docker stats
```

---

## 🚀 Production Deploy

### Via VPS (Ubuntu 22.04)

#### 1. Preparar Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y \
  git \
  curl \
  build-essential \
  nginx \
  certbot \
  python3-certbot-nginx

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER
```

#### 2. Clonar Repositório

```bash
cd /opt
sudo git clone https://github.com/your-repo/sms-extraction.git
cd sms-extraction
```

#### 3. Configurar Ambiente

```bash
# Copiar configuração
sudo cp .env.example .env

# Editar configurações
sudo nano .env
```

**.env:**
```bash
NODE_ENV=production
PORT=3000

# Database
DATABASE_PATH=/app/data/extractions.db

# Redis
REDIS_URL=redis://redis:6379

# OCR Services
EASYOCR_URL=http://easyocr:5001
PADDLEOCR_URL=http://paddleocr:5002

# API Keys (gerar com openssl rand -hex 32)
API_KEYS=key1,key2,key3

# Monitoring
ENABLE_METRICS=true
PROMETHEUS_PORT=9090
```

#### 4. Deploy

```bash
# Build e iniciar
sudo docker-compose -f docker-compose.prod.yml up -d --build

# Verificar status
sudo docker-compose ps

# Ver logs
sudo docker-compose logs -f
```

#### 5. Configurar SSL (Let's Encrypt)

```bash
# Obter certificado
sudo certbot --nginx -d sms-extraction.example.com

# Certificado será renovado automaticamente
```

#### 6. Configurar Firewall

```bash
# UFW
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions

**.github/workflows/deploy.yml:**

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm test
    
    - name: Run security audit
      run: npm audit --audit-level=moderate

  build:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker images
      run: |
        docker-compose -f docker-compose.prod.yml build
    
    - name: Log in to Docker Hub
      uses: docker/login-action@v2
      with:
        username: ${{ secrets.DOCKER_USERNAME }}
        password: ${{ secrets.DOCKER_PASSWORD }}
    
    - name: Push images
      run: |
        docker-compose -f docker-compose.prod.yml push

  deploy:
    needs: build
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /opt/sms-extraction
          git pull origin main
          docker-compose -f docker-compose.prod.yml pull
          docker-compose -f docker-compose.prod.yml up -d
          docker-compose -f docker-compose.prod.yml exec -T app node scripts/migrate.js
```

---

## 📊 Monitoramento

### Prometheus + Grafana

**docker-compose.monitoring.yml:**

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: sms-extraction-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    networks:
      - sms-network

  grafana:
    image: grafana/grafana:latest
    container_name: sms-extraction-grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    depends_on:
      - prometheus
    networks:
      - sms-network

volumes:
  prometheus-data:
  grafana-data:
```

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'sms-extraction'
    static_configs:
      - targets: ['app:9091']
```

### Metrics Endpoint

```javascript
// src/monitoring/metrics.js
const promClient = require('prom-client');

const register = new promClient.Registry();

// Métricas customizadas
const extractionCounter = new promClient.Counter({
  name: 'sms_extractions_total',
  help: 'Total de extrações processadas',
  labelNames: ['status', 'confidence_level']
});

const extractionDuration = new promClient.Histogram({
  name: 'sms_extraction_duration_seconds',
  help: 'Duração do processamento',
  buckets: [0.5, 1, 2, 5, 10]
});

const confidenceGauge = new promClient.Gauge({
  name: 'sms_extraction_confidence',
  help: 'Confiança média das extrações'
});

register.registerMetric(extractionCounter);
register.registerMetric(extractionDuration);
register.registerMetric(confidenceGauge);

// Endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

## ⚖️ Scaling

### Horizontal Scaling

```yaml
# docker-compose.scale.yml
version: '3.8'

services:
  app:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx-lb.conf:/etc/nginx/nginx.conf
```

**nginx-lb.conf (Load Balancer):**

```nginx
upstream app_cluster {
    least_conn;
    server app1:3000 weight=1;
    server app2:3000 weight=1;
    server app3:3000 weight=1;
}

server {
    listen 80;
    
    location / {
        proxy_pass http://app_cluster;
        proxy_next_upstream error timeout invalid_header http_500;
        proxy_connect_timeout 2s;
    }
}
```

### Queue System (Bull)

```javascript
// src/queue/processor.js
const Queue = require('bull');
const SMSExtractionPipeline = require('../pipeline');

const extractionQueue = new Queue('extraction', {
  redis: { host: 'redis', port: 6379 }
});

extractionQueue.process(5, async (job) => {
  const { imagePath } = job.data;
  
  const pipeline = new SMSExtractionPipeline();
  const result = await pipeline.process(imagePath);
  
  return result;
});

// Adicionar job
extractionQueue.add({ imagePath: '/uploads/image.png' });
```

---

## 🔒 Segurança

### SSL/TLS

```bash
# Gerar certificado self-signed (dev)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem
```

### Secrets Management

```bash
# Usar Docker Secrets
echo "my_api_key" | docker secret create api_key -

# Referenciar no compose
services:
  app:
    secrets:
      - api_key
```

### Security Headers

```nginx
# nginx.conf
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000" always;
```

---

**Próximo:** [10-troubleshooting.md](10-troubleshooting.md) - Solução de Problemas