# 07 - API Reference (Referência da API)

> **Navegação:** [← Validation Rules](06-validation-rules.md) | [Database Schema →](08-database-schema.md)

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Autenticação](#autenticação)
3. [Endpoints](#endpoints)
4. [CLI](#cli)
5. [SDK JavaScript](#sdk-javascript)
6. [Exemplos de Uso](#exemplos-de-uso)

---

## 🎯 Visão Geral

### Base URL
```
http://localhost:3000/api/v1
```

### Response Format
Todas as respostas seguem o formato:

```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "metadata": {
    "timestamp": "2025-06-15T10:30:00Z",
    "version": "2.0"
  }
}
```

### Error Format
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Mensagem de erro",
    "details": { ... }
  },
  "metadata": { ... }
}
```

### HTTP Status Codes
| Code | Significado |
|------|-------------|
| 200 | OK - Sucesso |
| 201 | Created - Recurso criado |
| 400 | Bad Request - Requisição inválida |
| 404 | Not Found - Recurso não encontrado |
| 429 | Too Many Requests - Rate limit |
| 500 | Internal Server Error - Erro no servidor |

---

## 🔐 Autenticação

### API Key (Recomendado para produção)

```bash
curl -H "X-API-Key: your_api_key_here" \
  http://localhost:3000/api/v1/extract
```

### Configuração
```javascript
// config/production.js
module.exports = {
  auth: {
    enabled: true,
    apiKeys: process.env.API_KEYS.split(',')
  }
};
```

---

## 📍 Endpoints

### 1. POST /extract - Extrair SMS

Processa uma imagem de SMS e retorna dados estruturados.

#### Request

```bash
curl -X POST http://localhost:3000/api/v1/extract \
  -F "image=@screenshot.png" \
  -H "X-API-Key: your_key"
```

**Multipart Form Data:**
- `image` (file, required): Arquivo de imagem (PNG, JPG, JPEG)
- `options` (json, optional): Opções de processamento

**Options:**
```json
{
  "returnOCRResults": false,
  "skipValidation": false,
  "confidenceThreshold": 85
}
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "Screenshot_20250609-031245.png",
    "remetente": "BancoInter",
    "dataReal": "06-09-2025",
    "mensagens": [
      {
        "hora": "09:30",
        "corpo": "Seu pagamento foi aprovado",
        "data": "06-09-2025",
        "confidence": 0.96
      }
    ],
    "metadata": {
      "confidence": {
        "overall": 95,
        "date": 92,
        "sender": 95,
        "messages": 96
      },
      "processingTime": 2450,
      "ocrEngine": "consensus",
      "extractionMethods": {
        "date": "banner_detection",
        "sender": "layout_pattern"
      },
      "validation": {
        "isValid": true,
        "issues": []
      }
    },
    "suggestedFilename": "2025-06-09_BancoInter_1msg.json"
  },
  "metadata": {
    "timestamp": "2025-06-15T10:30:00Z",
    "version": "2.0"
  }
}
```

#### Response (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "Arquivo de imagem inválido",
    "details": {
      "allowedFormats": ["PNG", "JPG", "JPEG"],
      "maxSize": "10MB"
    }
  }
}
```

---

### 2. POST /extract/batch - Processar Lote

Processa múltiplas imagens em lote.

#### Request

```bash
curl -X POST http://localhost:3000/api/v1/extract/batch \
  -F "images=@img1.png" \
  -F "images=@img2.png" \
  -F "images=@img3.png" \
  -H "X-API-Key: your_key"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "total": 3,
    "successful": 2,
    "failed": 1,
    "results": [
      {
        "filename": "img1.png",
        "status": "success",
        "data": { ... }
      },
      {
        "filename": "img2.png",
        "status": "success",
        "data": { ... }
      },
      {
        "filename": "img3.png",
        "status": "failed",
        "error": "Low quality image"
      }
    ]
  }
}
```

---

### 3. GET /extractions - Listar Extrações

Retorna lista de extrações anteriores.

#### Request

```bash
curl "http://localhost:3000/api/v1/extractions?limit=10&status=processed" \
  -H "X-API-Key: your_key"
```

**Query Parameters:**
- `limit` (int, default: 50): Número de resultados
- `offset` (int, default: 0): Offset para paginação
- `status` (string): Filtrar por status (processed, review, corrected)
- `sender` (string): Filtrar por remetente
- `dateFrom` (date): Data inicial (YYYY-MM-DD)
- `dateTo` (date): Data final (YYYY-MM-DD)
- `minConfidence` (int): Confiança mínima (0-100)

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "Screenshot_20250609-031245.png",
        "remetente": "BancoInter",
        "dataReal": "06-09-2025",
        "messageCount": 1,
        "confidence": 95,
        "status": "processed",
        "createdAt": "2025-06-15T10:30:00Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 10,
      "offset": 0,
      "hasNext": true
    }
  }
}
```

---

### 4. GET /extractions/:id - Obter Extração

Retorna detalhes de uma extração específica.

#### Request

```bash
curl "http://localhost:3000/api/v1/extractions/Screenshot_20250609-031245.png" \
  -H "X-API-Key: your_key"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "Screenshot_20250609-031245.png",
    "remetente": "BancoInter",
    "dataReal": "06-09-2025",
    "mensagens": [ ... ],
    "metadata": { ... }
  }
}
```

---

### 5. POST /review/submit - Enviar Correção

Envia correção humana para feedback loop.

#### Request

```bash
curl -X POST http://localhost:3000/api/v1/review/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_key" \
  -d '{
    "extractionId": "Screenshot_20250609-031245.png",
    "corrections": {
      "remetente": "Banco Inter",
      "dataReal": "06-09-2025",
      "mensagens": [ ... ]
    },
    "correctedBy": "user@example.com"
  }'
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "message": "Correção registrada com sucesso",
    "feedbackAdded": true,
    "retrainingQueued": false
  }
}
```

---

### 6. GET /review/pending - Obter Pendências

Retorna extrações que precisam de revisão.

#### Request

```bash
curl "http://localhost:3000/api/v1/review/pending?limit=10" \
  -H "X-API-Key: your_key"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "Screenshot_20250610-143022.png",
        "confidence": 72,
        "issues": [
          {
            "type": "LOW_CONFIDENCE_DATE",
            "severity": "WARNING",
            "message": "Data extraída com baixa confiança"
          }
        ],
        "extraction": { ... }
      }
    ],
    "total": 5
  }
}
```

---

### 7. GET /metrics - Métricas do Sistema

Retorna métricas de performance.

#### Request

```bash
curl "http://localhost:3000/api/v1/metrics?period=7d" \
  -H "X-API-Key: your_key"
```

#### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "period": "7d",
    "totalProcessed": 1523,
    "successRate": 92.3,
    "avgConfidence": 91.2,
    "avgProcessingTime": 2450,
    "humanReviewRate": 7.7,
    "breakdown": {
      "byConfidence": {
        "excellent": 1205,
        "good": 201,
        "acceptable": 95,
        "low": 22
      }
    }
  }
}
```

---

### 8. GET /health - Health Check

Verifica saúde do sistema.

#### Request

```bash
curl http://localhost:3000/api/v1/health
```

#### Response (200 OK)

```json
{
  "status": "healthy",
  "timestamp": "2025-06-15T10:30:00Z",
  "services": {
    "database": "ok",
    "redis": "ok",
    "tesseract": "ok",
    "easyocr": "ok",
    "paddleocr": "ok"
  },
  "version": "2.0"
}
```

---

## 💻 CLI

### Instalação

```bash
npm install -g sms-extraction-cli
```

### Comandos

#### Processar arquivo único
```bash
sms-extract process screenshot.png
```

#### Processar lote
```bash
sms-extract batch ./screenshots
```

#### Configurar API key
```bash
sms-extract config set-key YOUR_API_KEY
```

#### Ver métricas
```bash
sms-extract metrics --period 7d
```

#### Listar pendências
```bash
sms-extract review list
```

#### Enviar correção
```bash
sms-extract review submit <extraction-id> --corrections corrections.json
```

### Opções Globais

```bash
sms-extract [command] [options]

Options:
  --api-url <url>       URL da API (default: http://localhost:3000)
  --api-key <key>       API key
  --output <format>     Formato de saída (json, table)
  --verbose            Modo verbose
  --help               Mostra ajuda
```

---

## 📦 SDK JavaScript

### Instalação

```bash
npm install sms-extraction-sdk
```

### Uso Básico

```javascript
const SMSExtraction = require('sms-extraction-sdk');

// Inicializa cliente
const client = new SMSExtraction({
  apiUrl: 'http://localhost:3000',
  apiKey: 'your_api_key'
});

// Processa uma imagem
async function processImage() {
  try {
    const result = await client.extract('./screenshot.png');
    
    console.log('Remetente:', result.remetente);
    console.log('Data:', result.dataReal);
    console.log('Mensagens:', result.mensagens.length);
    console.log('Confiança:', result.metadata.confidence.overall + '%');
    
    if (result.metadata.confidence.overall < 85) {
      console.log('⚠️  Revisar manualmente');
    }
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

processImage();
```

### Processar Lote

```javascript
const fs = require('fs');
const path = require('path');

async function processBatch(directory) {
  const files = fs.readdirSync(directory)
    .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    .map(f => path.join(directory, f));
  
  const results = await client.extractBatch(files, {
    onProgress: (current, total) => {
      console.log(`Processando ${current}/${total}...`);
    }
  });
  
  console.log('Total:', results.total);
  console.log('Sucesso:', results.successful);
  console.log('Falhas:', results.failed);
  
  return results;
}
```

### Listar Extrações

```javascript
async function listExtractions() {
  const response = await client.list({
    limit: 10,
    status: 'processed',
    minConfidence: 90
  });
  
  response.items.forEach(item => {
    console.log(`${item.id}: ${item.remetente} (${item.confidence}%)`);
  });
}
```

### Enviar Correção

```javascript
async function submitCorrection(extractionId, corrections) {
  await client.submitReview(extractionId, {
    remetente: corrections.sender,
    dataReal: corrections.date,
    mensagens: corrections.messages,
    correctedBy: 'user@example.com'
  });
  
  console.log('Correção enviada com sucesso!');
}
```

### Obter Métricas

```javascript
async function getMetrics() {
  const metrics = await client.getMetrics({ period: '7d' });
  
  console.log('Taxa de sucesso:', metrics.successRate + '%');
  console.log('Confiança média:', metrics.avgConfidence + '%');
  console.log('Tempo médio:', metrics.avgProcessingTime + 'ms');
}
```

---

## 🔧 Exemplos de Uso

### Exemplo 1: Integração com Frontend

```javascript
// React Component
import React, { useState } from 'react';
import SMSExtraction from 'sms-extraction-sdk';

function UploadForm() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  
  const client = new SMSExtraction({
    apiUrl: process.env.REACT_APP_API_URL,
    apiKey: process.env.REACT_APP_API_KEY
  });
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await client.extract(file);
      setResult(result);
    } catch (error) {
      alert('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input 
          type="file" 
          accept="image/*"
          onChange={e => setFile(e.target.files[0])}
        />
        <button disabled={!file || loading}>
          {loading ? 'Processando...' : 'Extrair'}
        </button>
      </form>
      
      {result && (
        <div>
          <h3>Resultado</h3>
          <p>Remetente: {result.remetente}</p>
          <p>Data: {result.dataReal}</p>
          <p>Confiança: {result.metadata.confidence.overall}%</p>
        </div>
      )}
    </div>
  );
}
```

### Exemplo 2: Webhook Integration

```javascript
const express = require('express');
const SMSExtraction = require('sms-extraction-sdk');

const app = express();
const client = new SMSExtraction({ ... });

// Webhook recebe imagem de outro serviço
app.post('/webhook/process', async (req, res) => {
  const imageUrl = req.body.imageUrl;
  
  try {
    // Baixa imagem
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    
    // Processa
    const result = await client.extract(buffer);
    
    // Responde
    res.json({
      success: true,
      data: result
    });
    
    // Envia para sistema externo
    await sendToExternalSystem(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(3001);
```

### Exemplo 3: Processamento Agendado

```javascript
const cron = require('node-cron');
const SMSExtraction = require('sms-extraction-sdk');

const client = new SMSExtraction({ ... });

// Processa novos arquivos a cada hora
cron.schedule('0 * * * *', async () => {
  console.log('Iniciando processamento agendado...');
  
  const newFiles = await getNewFiles('./inbox');
  
  if (newFiles.length > 0) {
    const results = await client.extractBatch(newFiles);
    
    console.log(`Processados: ${results.successful}/${results.total}`);
    
    // Move arquivos processados
    results.results.forEach(result => {
      if (result.status === 'success') {
        moveFile(result.filename, './processed');
      } else {
        moveFile(result.filename, './failed');
      }
    });
  }
});
```

---

## 📝 Rate Limiting

### Limites Padrão

| Endpoint | Limite |
|----------|--------|
| `/extract` | 100 req/min |
| `/extract/batch` | 10 req/min |
| `/extractions` | 300 req/min |
| Outros | 200 req/min |

### Headers de Rate Limit

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1623456789
```

### Resposta quando excede limite

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de requisições excedido",
    "details": {
      "limit": 100,
      "retryAfter": 60
    }
  }
}
```

---

**Próximo:** [08-database-schema.md](08-database-schema.md) - Esquema do Banco de Dados