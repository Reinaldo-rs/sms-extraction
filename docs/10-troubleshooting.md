# 10 - Troubleshooting (Solução de Problemas)

> **Navegação:** [← Deployment](09-deployment.md) | [Implementation Checklist →](11-implementation-checklist.md)

---

## 📑 Índice

1. [Problemas Comuns](#problemas-comuns)
2. [Erros de OCR](#erros-de-ocr)
3. [Problemas de Performance](#problemas-de-performance)
4. [Erros de Validação](#erros-de-validação)
5. [Problemas de Infraestrutura](#problemas-de-infraestrutura)
6. [Debug e Logs](#debug-e-logs)

---

## 🔧 Problemas Comuns

### 1. "All OCR engines failed"

**Sintoma:**
```
Error: All OCR engines failed
```

**Causas Possíveis:**

#### A. Serviços Python não estão rodando
```bash
# Verificar status
docker-compose ps

# Verificar logs
docker-compose logs easyocr
docker-compose logs paddleocr

# Reiniciar serviços
docker-compose restart easyocr paddleocr
```

#### B. Timeout nos serviços
```javascript
// Aumentar timeout em config.js
module.exports = {
  ocr: {
    easyocr: {
      timeout: 60000  // 60s ao invés de 30s
    }
  }
};
```

#### C. Imagem muito grande
```javascript
// Reduzir imagem antes de enviar
const sharp = require('sharp');

const buffer = await sharp(imagePath)
  .resize(1920, null, { fit: 'inside' })
  .toBuffer();
```

**Solução:**
1. Verificar se serviços estão rodando
2. Testar cada serviço individualmente:
   ```bash
   curl http://localhost:5001/health
   curl http://localhost:5002/health
   ```
3. Se apenas EasyOCR/Paddle falharem, sistema usa Tesseract (fallback)

---

### 2. Confiança Sempre Baixa (<70%)

**Sintoma:**
Todas as extrações têm confiança abaixo de 70%, mesmo em imagens de boa qualidade.

**Diagnóstico:**
```javascript
// Adicionar logs detalhados
console.log('OCR Confidence:', ocrResults.confidence);
console.log('Date Confidence:', dateExtraction.confidence);
console.log('Sender Confidence:', senderExtraction.confidence);
```

**Causas Possíveis:**

#### A. Pré-processamento inadequado
```javascript
// Verificar qualidade da imagem
const quality = await qualityAnalyzer.analyze(image);
console.log('Quality Score:', quality.score);
console.log('Needs Enhancement:', quality.needsEnhancement);
```

**Solução:**
```javascript
// Ajustar parâmetros de preprocessamento
const preprocessor = new ImagePreprocessor({
  sharpen: {
    sigma: 2.0,  // Aumentar nitidez
    m1: 0.8,
    m2: 0.8
  },
  contrast: {
    factor: 1.2  // Aumentar contraste
  }
});
```

#### B. OCR não está otimizado
```javascript
// Tesseract config para SMS
const tesseractConfig = {
  lang: 'por',
  psm: 6,  // Assume single uniform block
  oem: 3
};
```

---

### 3. Data Não É Extraída

**Sintoma:**
```json
{
  "dataReal": null,
  "metadata": {
    "confidence": {
      "date": 0
    }
  }
}
```

**Diagnóstico:**
```javascript
// Ativar logs de debug
const dateExtractor = new DateExtractor({ debug: true });

// Ver tentativas de extração
const attempts = await dateExtractor.extractWithDetails(ocrResults);
console.log('Extraction attempts:', attempts);
```

**Causas Possíveis:**

#### A. Data está em formato não reconhecido
```javascript
// Adicionar novo padrão
const datePatterns = [
  /(\d{1,2})\s+de\s+(\w+)/i,
  /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
  // Adicionar seu padrão:
  /seu_padrao_aqui/i
];
```

#### B. Tarja de data não está sendo detectada
```javascript
// Ajustar detecção de tarja
function detectDateBanner(ocrResults) {
  // Procurar em área maior
  const candidates = ocrResults.filter(r => 
    r.bbox.top < 500  // Aumentar de 400 para 500
  );
  
  console.log('Date banner candidates:', candidates);
}
```

**Solução:**
```javascript
// Usar múltiplas estratégias
const strategies = [
  this.extractFromBanner(ocrResults),
  this.extractFromFilename(context.filename),
  this.extractFromExif(context.exif),
  this.extractFromContext(ocrResults)  // Nova estratégia
];
```

---

### 4. Mensagens Duplicadas

**Sintoma:**
```json
{
  "mensagens": [
    { "hora": "09:30", "corpo": "Olá" },
    { "hora": "09:30", "corpo": "Olá" },
    { "hora": "09:30", "corpo": "Olá" }
  ]
}
```

**Causa:**
OCR detectando o mesmo texto múltiplas vezes.

**Solução:**
```javascript
// Adicionar deduplicação
class MessageExtractor {
  deduplicateMessages(messages) {
    const seen = new Set();
    
    return messages.filter(msg => {
      const key = `${msg.hora}-${msg.corpo}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  
  async extract(ocrResults, date) {
    let messages = await this.extractRaw(ocrResults, date);
    messages = this.deduplicateMessages(messages);
    return messages;
  }
}
```

---

## 👁️ Erros de OCR

### 1. Tesseract Retorna Texto Ilegível

**Sintoma:**
```
Text: "â–ˆâ–ˆ â–ˆâ–ˆâ–ˆ â–ˆâ–ˆâ–ˆâ–ˆ"
```

**Causa:**
Imagem está invertida (texto branco em fundo escuro).

**Solução:**
```javascript
// Detectar e inverter
async function preprocessForOCR(image) {
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  
  // Calcular brilho médio
  const avg = data.reduce((sum, val) => sum + val, 0) / data.length;
  
  // Se muito escuro, inverter
  if (avg < 128) {
    image = image.negate();
    console.log('Image inverted for better OCR');
  }
  
  return image;
}
```

---

### 2. EasyOCR/PaddleOCR Timeout

**Sintoma:**
```
Error: EasyOCR timeout after 30000ms
```

**Solução:**

#### Aumentar timeout
```javascript
const easyOCR = new EasyOCRClient({
  baseURL: 'http://localhost:5001',
  timeout: 60000  // 60s
});
```

#### Adicionar retry
```javascript
async function extractWithRetry(engine, image, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await engine.extract(image);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      console.warn(`Retry ${i + 1}/${maxRetries} after error:`, error.message);
      await sleep(2000 * (i + 1));  // Backoff exponencial
    }
  }
}
```

---

### 3. Caracteres Especiais Não Reconhecidos

**Sintoma:**
Emojis e acentos são substituídos por "?" ou "�".

**Solução:**
```javascript
// Garantir encoding UTF-8
const text = Buffer.from(ocrResult.text, 'utf8').toString('utf8');

// Normalizar Unicode
const normalized = text.normalize('NFC');
```

---

## 🚀 Problemas de Performance

### 1. Processamento Muito Lento (>10s)

**Diagnóstico:**
```javascript
// Adicionar timers
const startTime = Date.now();

const preprocessTime = Date.now();
console.log('Preprocessing:', preprocessTime - startTime, 'ms');

const ocrTime = Date.now();
console.log('OCR:', ocrTime - preprocessTime, 'ms');

const extractionTime = Date.now();
console.log('Extraction:', extractionTime - ocrTime, 'ms');
```

**Causas e Soluções:**

#### A. Imagens muito grandes
```javascript
// Redimensionar antes de processar
if (metadata.width > 2000 || metadata.height > 2000) {
  image = await sharp(image)
    .resize(2000, 2000, { fit: 'inside' })
    .toBuffer();
}
```

#### B. Processamento sequencial
```javascript
// Paralelizar onde possível
const [date, sender, messages] = await Promise.all([
  this.extractDate(ocrResults),
  this.extractSender(ocrResults),
  this.extractMessages(ocrResults)
]);
```

#### C. Redis não está sendo usado
```javascript
// Verificar cache
const cached = await cache.get(imageHash);
if (cached) {
  console.log('Cache HIT');
  return cached;
}

console.log('Cache MISS');
const result = await process(image);
await cache.set(imageHash, result, 3600);
```

---

### 2. Memory Leak

**Sintoma:**
Uso de memória cresce continuamente até crash.

**Diagnóstico:**
```bash
# Monitorar memória
docker stats sms-extraction-app

# Heap snapshot
node --inspect main.js
# Chrome DevTools > Memory > Take snapshot
```

**Causas Comuns:**

#### A. TensorFlow tensors não liberados
```javascript
// ❌ ERRADO
const tensor = tf.tensor2d(data);
const result = model.predict(tensor);
return result;

// ✅ CORRETO
let tensor, result;
try {
  tensor = tf.tensor2d(data);
  result = model.predict(tensor);
  const output = await result.array();
  return output;
} finally {
  if (tensor) tensor.dispose();
  if (result) result.dispose();
}
```

#### B. Event listeners não removidos
```javascript
// ❌ ERRADO
pipeline.on('complete', handler);

// ✅ CORRETO
pipeline.once('complete', handler);
// ou
pipeline.on('complete', handler);
// ... depois
pipeline.off('complete', handler);
```

#### C. Sharp buffers acumulando
```javascript
// Liberar explicitamente
const buffer = await sharp(image).toBuffer();
// ... usar buffer
buffer = null;  // Permitir GC
```

---

### 3. CPU 100%

**Causa:**
Processamento de imagem é CPU-intensive.

**Solução:**

#### Limitar concorrência
```javascript
const pLimit = require('p-limit');
const limit = pLimit(2);  // Max 2 processamentos simultâneos

const results = await Promise.all(
  files.map(file => limit(() => process(file)))
);
```

#### Usar worker threads
```javascript
const { Worker } = require('worker_threads');

function processInWorker(imagePath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', {
      workerData: { imagePath }
    });
    
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}
```

---

## ✅ Erros de Validação

### 1. "SCHEMA_ERROR"

**Sintoma:**
```json
{
  "type": "SCHEMA_ERROR",
  "field": "/dataReal",
  "message": "should match pattern"
}
```

**Causa:**
Data em formato incorreto.

**Solução:**
```javascript
// Normalizar formato
function normalizeDate(dateStr) {
  // Aceita vários formatos e retorna MM-DD-YYYY
  const formats = [
    /(\d{2})-(\d{2})-(\d{4})/,  // MM-DD-YYYY
    /(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /(\d{4})-(\d{2})-(\d{2})/   // YYYY-MM-DD
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const [, p1, p2, p3] = match;
      
      // Detecta formato e converte
      if (p1.length === 4) {
        // YYYY-MM-DD → MM-DD-YYYY
        return `${p2}-${p3}-${p1}`;
      } else {
        return `${p1}-${p2}-${p3}`;
      }
    }
  }
  
  throw new Error('Invalid date format');
}
```

---

### 2. "NON_SEQUENTIAL_TIMES"

**Sintoma:**
```json
{
  "type": "NON_SEQUENTIAL_TIMES",
  "message": "Horário fora de ordem: 14:30 após 15:45"
}
```

**Causa:**
OCR detectou mensagens fora de ordem.

**Solução:**
```javascript
// Ordenar automaticamente
function sortMessages(messages) {
  return messages.sort((a, b) => {
    const [ha, ma] = a.hora.split(':').map(Number);
    const [hb, mb] = b.hora.split(':').map(Number);
    return (ha * 60 + ma) - (hb * 60 + mb);
  });
}

// Aplicar antes de validar
extraction.mensagens = sortMessages(extraction.mensagens);
```

---

## 🏗️ Problemas de Infraestrutura

### 1. "ECONNREFUSED" (Python Services)

**Sintoma:**
```
Error: connect ECONNREFUSED 127.0.0.1:5001
```

**Diagnóstico:**
```bash
# Verificar se serviço está rodando
curl http://localhost:5001/health

# Ver logs
docker-compose logs easyocr
```

**Soluções:**

#### Serviço não iniciou
```bash
# Reiniciar
docker-compose restart easyocr

# Ver erro de inicialização
docker-compose logs easyocr | grep -i error
```

#### Porta incorreta
```javascript
// Verificar configuração
const config = {
  easyocr: {
    url: process.env.EASYOCR_URL || 'http://localhost:5001'
  }
};
```

#### Network issue (Docker)
```bash
# Verificar network
docker network ls
docker network inspect sms-network

# Usar nome do serviço ao invés de localhost
# Em docker-compose, usar: http://easyocr:5001
```

---

### 2. Database Locked

**Sintoma:**
```
Error: SQLITE_BUSY: database is locked
```

**Causa:**
Múltiplos processos tentando escrever simultaneamente.

**Solução:**

#### Habilitar WAL mode
```javascript
// Na inicialização do banco
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
```

#### Usar connection pooling
```javascript
const pool = new Pool({
  create: () => new Database(dbPath),
  destroy: (db) => db.close(),
  max: 10,
  min: 2
});
```

#### Retry em caso de lock
```javascript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        await sleep(100 * (i + 1));
        continue;
      }
      throw error;
    }
  }
}
```

---

### 3. Redis Connection Error

**Sintoma:**
```
Error: Redis connection to localhost:6379 failed
```

**Solução:**
```javascript
// Adicionar retry logic
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3
});

// Fallback se Redis não disponível
redis.on('error', (err) => {
  console.warn('Redis error:', err.message);
  console.warn('Continuing without cache...');
});
```

---

## 🔍 Debug e Logs

### Ativar Modo Debug

```bash
# Via environment
DEBUG=sms:* node main.js

# Via config
NODE_ENV=development DEBUG_LEVEL=verbose node main.js
```

### Logs Estruturados

```javascript
// src/utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log' 
    })
  ]
});

// Console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
```

### Uso:
```javascript
const logger = require('./utils/logger');

logger.info('Processing image', { 
  filename: 'screenshot.png',
  size: 245678 
});

logger.error('OCR failed', { 
  error: error.message,
  stack: error.stack,
  image: imagePath 
});
```

### Análise de Logs

```bash
# Ver últimos erros
tail -f error.log | jq 'select(.level=="error")'

# Contar erros por tipo
cat combined.log | jq -r '.error.code' | sort | uniq -c

# Performance de OCR
cat combined.log | jq 'select(.ocrTime) | .ocrTime' | awk '{sum+=$1; count++} END {print sum/count}'
```

---

## 📞 Suporte

### Checklist Antes de Reportar Bug

- [ ] Versão do Node.js: `node --version`
- [ ] Versão do projeto: `git describe --tags`
- [ ] Sistema operacional
- [ ] Logs completos (últimas 50 linhas)
- [ ] Imagem de exemplo (se possível)
- [ ] Passos para reproduzir
- [ ] Comportamento esperado vs atual

### Template de Issue

```markdown
## Descrição
[Descrição clara do problema]

## Ambiente
- Node.js: v18.17.0
- SO: Ubuntu 22.04
- Docker: Sim/Não

## Passos para Reproduzir
1. Carregar imagem X
2. Executar comando Y
3. Observar erro Z

## Logs
```
[Colar logs aqui]
```

## Comportamento Esperado
[O que deveria acontecer]

## Comportamento Atual
[O que está acontecendo]
```

---

**Próximo:** [11-implementation-checklist.md](11-implementation-checklist.md) - Checklist de Implementação