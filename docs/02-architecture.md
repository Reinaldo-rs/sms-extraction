# 02 - Arquitetura do Sistema

> **Navegação:** [← Overview](01-overview.md) | [Pipeline Flow →](03-pipeline-flow.md)

---

## 📑 Índice

1. [Estrutura de Diretórios](#estrutura-de-diretórios)
2. [Camadas do Sistema](#camadas-do-sistema)
3. [Módulos Principais](#módulos-principais)
4. [Fluxo de Dados](#fluxo-de-dados)
5. [Padrões de Projeto](#padrões-de-projeto)
6. [Dependências](#dependências)

---

## 📁 Estrutura de Diretórios

```
sms-extraction-v2/
├── src/
│   ├── preprocessing/           # Melhoria de imagens
│   │   ├── imageEnhancer.js
│   │   ├── rotationDetector.js
│   │   ├── cropDetector.js
│   │   └── qualityAnalyzer.js
│   │
│   ├── ocr/                     # Engines OCR
│   │   ├── multiEngine.js       # Orquestrador
│   │   ├── tesseractOCR.js     # Engine 1
│   │   ├── easyOCR.js          # Engine 2 (Python)
│   │   ├── paddleOCR.js        # Engine 3 (Python)
│   │   └── consensusVoting.js   # Sistema de votação
│   │
│   ├── processor/               # Extração de dados
│   │   ├── blockDetector.js    # Detecta blocos de texto
│   │   ├── dateExtractor.js    # Extrai datas
│   │   ├── senderExtractor.js  # Extrai remetente
│   │   ├── messageExtractor.js # Extrai mensagens
│   │   └── confidenceScorer.js # Calcula confiança
│   │
│   ├── ml/                      # Machine Learning
│   │   ├── patternRecognizer.js
│   │   ├── layoutClassifier.js
│   │   ├── datePredictor.js
│   │   └── trainingPipeline.js
│   │
│   ├── validation/              # Validadores
│   │   ├── schemaValidator.js
│   │   ├── businessRules.js
│   │   ├── crossValidator.js
│   │   └── anomalyDetector.js
│   │
│   ├── correction/              # Correção e feedback
│   │   ├── humanReview.js
│   │   ├── feedbackLoop.js
│   │   └── autoCorrect.js
│   │
│   ├── storage/                 # Persistência
│   │   ├── database.js         # SQLite
│   │   ├── cache.js            # Redis
│   │   └── logs.js             # Winston
│   │
│   ├── monitoring/              # Observabilidade
│   │   ├── dashboard.js
│   │   ├── metrics.js
│   │   └── alerts.js
│   │
│   └── api/                     # API REST
│       ├── routes.js
│       ├── middleware.js
│       └── controllers.js
│
├── python-services/             # Microserviços Python
│   ├── easyocr-service/
│   │   ├── app.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── paddleocr-service/
│       ├── app.py
│       ├── requirements.txt
│       └── Dockerfile
│
├── data/
│   ├── models/                  # Modelos ML
│   │   ├── date_extractor/
│   │   ├── layout_classifier/
│   │   └── pattern_recognizer/
│   │
│   ├── training/                # Dados de treinamento
│   │   ├── raw/
│   │   ├── processed/
│   │   └── validated/
│   │
│   └── extractions.db          # Banco SQLite
│
├── config/
│   ├── default.json
│   ├── production.json
│   └── test.json
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/                        # Esta documentação
│   ├── 01-overview.md
│   ├── 02-architecture.md
│   └── ...
│
├── main.js                      # Entry point
├── config.js                    # Configurações
├── package.json
└── README.md
```

---

## 🏛️ Camadas do Sistema

### Camada 1: Entrada (Input Layer)
```
┌─────────────────────────────────┐
│  INPUT LAYER                    │
│  • File upload (API)            │
│  • Batch processing (CLI)       │
│  • Webhook triggers             │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 2: Pré-processamento (Preprocessing Layer)
```
┌─────────────────────────────────┐
│  PREPROCESSING LAYER            │
│  • Quality analysis             │
│  • Rotation detection           │
│  • Image enhancement            │
│  • Normalization                │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 3: OCR (OCR Layer)
```
┌─────────────────────────────────┐
│  OCR LAYER                      │
│  ┌──────────┬──────────┬──────┐│
│  │Tesseract │ EasyOCR  │Paddle││
│  └──────────┴──────────┴──────┘│
│  • Multi-engine execution       │
│  • Consensus voting             │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 4: Processamento (Processing Layer)
```
┌─────────────────────────────────┐
│  PROCESSING LAYER               │
│  • Block detection              │
│  • Data extraction              │
│  • Pattern matching             │
│  • ML prediction                │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 5: Validação (Validation Layer)
```
┌─────────────────────────────────┐
│  VALIDATION LAYER               │
│  • Schema validation            │
│  • Business rules               │
│  • Cross validation             │
│  • Anomaly detection            │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 6: Persistência (Storage Layer)
```
┌─────────────────────────────────┐
│  STORAGE LAYER                  │
│  • Database (SQLite)            │
│  • Cache (Redis)                │
│  • Logs (Files)                 │
└─────────────────┬───────────────┘
                  │
                  ▼
```

### Camada 7: Saída (Output Layer)
```
┌─────────────────────────────────┐
│  OUTPUT LAYER                   │
│  • JSON structured              │
│  • File naming                  │
│  • API response                 │
│  • Human review queue           │
└─────────────────────────────────┘
```

---

## 🔧 Módulos Principais

### 1. SMSExtractionPipeline (Orquestrador)

```javascript
class SMSExtractionPipeline {
  constructor(config) {
    this.config = config;
    this.preprocessor = new ImagePreprocessor();
    this.ocrEngine = new MultiOCREngine();
    this.processor = new DataProcessor();
    this.validator = new ValidationEngine();
    this.storage = new StorageManager();
    this.monitor = new MonitoringService();
  }

  async process(imagePath) {
    const trace = new ProcessingTrace();
    
    try {
      // 1. Preprocessing
      const preprocessed = await this.preprocessor.enhance(imagePath);
      trace.add('preprocessing', preprocessed);
      
      // 2. OCR
      const ocrResults = await this.ocrEngine.extractAll(preprocessed);
      trace.add('ocr', ocrResults);
      
      // 3. Extraction
      const extracted = await this.processor.extract(ocrResults);
      trace.add('extraction', extracted);
      
      // 4. Validation
      const validated = await this.validator.validate(extracted);
      trace.add('validation', validated);
      
      // 5. Storage
      await this.storage.save(validated);
      
      // 6. Monitoring
      await this.monitor.record(trace);
      
      return validated;
      
    } catch (error) {
      trace.addError(error);
      await this.monitor.recordError(trace);
      throw error;
    }
  }
}
```

**Responsabilidades:**
- Coordenar todas as etapas
- Gerenciar fluxo de dados
- Tratamento de erros
- Logging e métricas

---

### 2. ImagePreprocessor

```javascript
class ImagePreprocessor {
  async enhance(imagePath) {
    const image = await sharp(imagePath);
    const metadata = await image.metadata();
    
    // Análise de qualidade
    const quality = await this.analyzeQuality(image);
    
    // Pipeline de melhorias
    const pipeline = this.buildPipeline(image, quality);
    
    return await pipeline.toBuffer();
  }
  
  buildPipeline(image, quality) {
    let pipeline = image;
    
    if (quality.needsRotation) {
      pipeline = pipeline.rotate(quality.angle);
    }
    
    if (quality.needsResize) {
      pipeline = pipeline.resize(null, 1920);
    }
    
    pipeline = pipeline
      .normalize()      // Contraste
      .sharpen()        // Nitidez
      .median(3);       // Redução de ruído
    
    return pipeline;
  }
}
```

**Responsabilidades:**
- Melhorar qualidade da imagem
- Corrigir rotação
- Normalizar resolução
- Reduzir ruído

---

### 3. MultiOCREngine

```javascript
class MultiOCREngine {
  constructor() {
    this.engines = {
      tesseract: new TesseractEngine(),
      easyocr: new EasyOCRClient('http://localhost:5001'),
      paddle: new PaddleOCRClient('http://localhost:5002')
    };
    
    this.circuitBreakers = {
      easyocr: new CircuitBreaker(),
      paddle: new CircuitBreaker()
    };
  }

  async extractAll(image) {
    // Executa em paralelo com tratamento de erro
    const results = await Promise.allSettled([
      this.runWithRetry('tesseract', image),
      this.runWithCircuitBreaker('easyocr', image),
      this.runWithCircuitBreaker('paddle', image)
    ]);
    
    // Filtra sucessos
    const successful = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    if (successful.length === 0) {
      throw new Error('All OCR engines failed');
    }
    
    // Votação
    return this.applyConsensus(successful);
  }
  
  async runWithCircuitBreaker(engineName, image) {
    const breaker = this.circuitBreakers[engineName];
    const engine = this.engines[engineName];
    
    return await breaker.execute(() => engine.extract(image));
  }
}
```

**Responsabilidades:**
- Coordenar múltiplos OCRs
- Implementar circuit breaker
- Sistema de votação
- Tratamento de falhas

---

### 4. DataProcessor

```javascript
class DataProcessor {
  constructor() {
    this.dateExtractor = new DateExtractor();
    this.senderExtractor = new SenderExtractor();
    this.messageExtractor = new MessageExtractor();
    this.confidenceScorer = new ConfidenceScorer();
  }

  async extract(ocrResults) {
    // Extração paralela
    const [date, sender, messages] = await Promise.all([
      this.dateExtractor.extract(ocrResults),
      this.senderExtractor.extract(ocrResults),
      this.messageExtractor.extract(ocrResults)
    ]);
    
    // Monta resultado
    const extraction = {
      id: this.generateId(),
      remetente: sender.value,
      dataReal: date.value,
      mensagens: messages.value,
      metadata: {
        confidence: {
          date: date.confidence,
          sender: sender.confidence,
          messages: messages.confidence
        },
        methods: {
          date: date.method,
          sender: sender.method
        }
      }
    };
    
    // Calcula confiança geral
    extraction.metadata.confidence.overall = 
      this.confidenceScorer.calculate(extraction);
    
    return extraction;
  }
}
```

**Responsabilidades:**
- Extrair data
- Extrair remetente
- Extrair mensagens
- Calcular confiança

---

### 5. ValidationEngine

```javascript
class ValidationEngine {
  constructor() {
    this.validators = [
      new SchemaValidator(),
      new BusinessRulesValidator(),
      new CrossValidator(),
      new AnomalyDetector()
    ];
  }

  async validate(extraction) {
    const results = [];
    
    for (const validator of this.validators) {
      const result = await validator.validate(extraction);
      results.push(result);
    }
    
    const isValid = results.every(r => r.isValid);
    const issues = results.flatMap(r => r.issues || []);
    
    return {
      ...extraction,
      validation: {
        isValid,
        issues,
        scores: results.map(r => r.score)
      }
    };
  }
}
```

**Responsabilidades:**
- Validar schema JSON
- Aplicar regras de negócio
- Detectar anomalias
- Gerar relatório de validação

---

## 🔄 Fluxo de Dados

### Estrutura de Dados em Cada Etapa

#### 1. Input
```javascript
{
  path: "/uploads/screenshot.png",
  size: 245678,
  format: "PNG",
  dimensions: { width: 1080, height: 1920 }
}
```

#### 2. Após Preprocessing
```javascript
{
  original: "/uploads/screenshot.png",
  processed: <Buffer>,
  quality: {
    score: 0.85,
    needsRotation: false,
    needsEnhancement: true,
    appliedFilters: ["normalize", "sharpen", "median"]
  }
}
```

#### 3. Após OCR
```javascript
{
  consensus: [
    {
      text: "Banco Inter",
      bbox: { left: 100, top: 150, right: 300, bottom: 180 },
      confidence: 0.95,
      votes: 3  // Todos concordaram
    },
    {
      text: "09:30",
      bbox: { left: 50, top: 500, right: 120, bottom: 530 },
      confidence: 0.98,
      votes: 3
    }
  ],
  individual: {
    tesseract: [...],
    easyocr: [...],
    paddle: [...]
  }
}
```

#### 4. Após Extraction
```javascript
{
  id: "Screenshot_20250609-031245.png",
  remetente: "BancoInter",
  dataReal: "06-09-2025",
  mensagens: [
    {
      hora: "09:30",
      corpo: "Seu pagamento foi aprovado",
      data: "06-09-2025",
      confidence: 0.96
    }
  ],
  metadata: {
    confidence: {
      overall: 95,
      date: 92,
      sender: 95,
      messages: 96
    }
  }
}
```

#### 5. Após Validation
```javascript
{
  // ... tudo anterior
  validation: {
    isValid: true,
    issues: [],
    scores: [1.0, 0.95, 0.98, 1.0]
  }
}
```

---

## 🎨 Padrões de Projeto Utilizados

### 1. **Pipeline Pattern**
```javascript
image → preprocess → ocr → extract → validate → output
```
Cada etapa é independente e pode ser testada isoladamente.

### 2. **Strategy Pattern** (OCR Engines)
```javascript
interface OCREngine {
  extract(image): Promise<OCRResult>
}

class TesseractEngine implements OCREngine { ... }
class EasyOCREngine implements OCREngine { ... }
class PaddleOCREngine implements OCREngine { ... }
```

### 3. **Observer Pattern** (Monitoring)
```javascript
pipeline.on('step:complete', (data) => {
  monitor.record(data);
});

pipeline.on('error', (error) => {
  monitor.recordError(error);
  alerts.notify(error);
});
```

### 4. **Circuit Breaker Pattern**
```javascript
// Protege contra falhas em cascata
if (circuitBreaker.isOpen('easyocr')) {
  return fallbackToTesseract();
}
```

### 5. **Repository Pattern** (Storage)
```javascript
class ExtractionRepository {
  async save(extraction) { ... }
  async findById(id) { ... }
  async findByDateRange(start, end) { ... }
}
```

---

## 📦 Dependências

### Node.js (package.json)
```json
{
  "dependencies": {
    "sharp": "^0.33.0",
    "tesseract.js": "^5.0.0",
    "tensorflow": "^4.15.0",
    "better-sqlite3": "^9.2.0",
    "redis": "^4.6.0",
    "winston": "^3.11.0",
    "express": "^4.18.0",
    "ajv": "^8.12.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "eslint": "^8.56.0"
  }
}
```

### Python (requirements.txt para cada microserviço)
```txt
# easyocr-service/requirements.txt
easyocr==1.7.0
flask==3.0.0
gunicorn==21.2.0
pillow==10.1.0

# paddleocr-service/requirements.txt
paddlepaddle==2.5.2
paddleocr==2.7.0
flask==3.0.0
gunicorn==21.2.0
```

---

## 🔐 Segurança

### Práticas Implementadas

1. **Validação de Input**
```javascript
// Valida tipo e tamanho de arquivo
const allowedTypes = ['image/png', 'image/jpeg'];
const maxSize = 10 * 1024 * 1024; // 10MB
```

2. **Sanitização de Nomes de Arquivo**
```javascript
const safeName = fileName
  .replace(/[^a-zA-Z0-9._-]/g, '_')
  .slice(0, 255);
```

3. **Rate Limiting**
```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}));
```

4. **Secrets Management**
```javascript
// Nunca commitar chaves no código
const apiKey = process.env.OCR_API_KEY;
```

---

## 📊 Escalabilidade

### Horizontal Scaling
```
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Worker 1│  │ Worker 2│  │ Worker 3│
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  │
            ┌─────▼─────┐
            │   Queue   │
            │  (Redis)  │
            └───────────┘
```

### Caching Strategy
```
L1: In-Memory (Node.js)
L2: Redis (Shared)
L3: Database (Persistent)
```

---

**Próximo:** [03-pipeline-flow.md](03-pipeline-flow.md) - Fluxo Detalhado do Pipeline