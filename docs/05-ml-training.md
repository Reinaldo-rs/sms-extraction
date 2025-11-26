# 05 - Machine Learning e Treinamento

> **Navegação:** [← OCR Engines](04-ocr-engines.md) | [Validation Rules →](06-validation-rules.md)

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Modelo de Predição de Data](#modelo-de-predição-de-data)
3. [Classificador de Layout](#classificador-de-layout)
4. [Reconhecedor de Padrões](#reconhecedor-de-padrões)
5. [Pipeline de Treinamento](#pipeline-de-treinamento)
6. [Feedback Loop](#feedback-loop)
7. [Métricas de Performance](#métricas-de-performance)

---

## 🎯 Visão Geral

### Quando o ML é Usado?

```
OCR → Regras Heurísticas → ML (se necessário)
```

**ML é acionado quando:**
- ❌ Data não encontrada por regex
- ❌ Remetente ambíguo
- ❌ Layout desconhecido
- ❌ Confiança baixa

### Modelos Implementados

| Modelo | Propósito | Acurácia | Uso |
|--------|-----------|----------|-----|
| **Date Predictor** | Prediz data ausente | ~75% | 15% dos casos |
| **Layout Classifier** | Identifica tipo de SMS | ~90% | 100% dos casos |
| **Pattern Recognizer** | Detecta padrões de remetente | ~85% | 30% dos casos |

---

## 📅 Modelo de Predição de Data

### Arquitetura

```
Input Features (10) → Dense(64, relu) → Dropout(0.2) → 
Dense(32, relu) → Output(3) → [month, day, year]
```

### Features (Entrada)

```javascript
function extractFeatures(ocrResults, context) {
  return [
    // 1-3: Estatísticas de horários
    context.messageCount,              // Número de mensagens
    context.firstMessageHour || 0,     // Primeira hora
    context.lastMessageHour || 0,      // Última hora
    
    // 4-7: Palavras-chave temporais
    context.text.includes('hoje') ? 1 : 0,
    context.text.includes('ontem') ? 1 : 0,
    context.text.includes('segunda|terça|quarta') ? 1 : 0,
    /\d{1,2}\/\d{1,2}/.test(context.text) ? 1 : 0,
    
    // 8-10: Metadados do arquivo
    context.exif?.month || 0,
    context.exif?.day || 0,
    context.exif?.year || 0
  ];
}
```

### Implementação TensorFlow.js

```javascript
// src/ml/datePredictor.js
const tf = require('@tensorflow/tfjs-node');

class DatePredictor {
  constructor() {
    this.model = null;
    this.modelPath = './data/models/date_extractor';
  }

  async loadModel() {
    if (!this.model) {
      try {
        this.model = await tf.loadLayersModel(
          `file://${this.modelPath}/model.json`
        );
        console.log('Date prediction model loaded');
      } catch (error) {
        console.warn('Model not found, will train on first use');
      }
    }
  }

  async predict(ocrResults, context) {
    await this.loadModel();
    
    if (!this.model) {
      throw new Error('Model not available');
    }

    // Extrai features
    const features = this.extractFeatures(ocrResults, context);
    
    // Predição
    const tensor = tf.tensor2d([features]);
    const prediction = this.model.predict(tensor);
    const result = await prediction.array();
    
    // Cleanup
    tensor.dispose();
    prediction.dispose();
    
    // Formata resultado
    const [month, day, year] = result[0];
    
    return {
      date: this.formatDate(month, day, year),
      confidence: this.calculateConfidence(result[0]),
      method: 'ml_prediction'
    };
  }

  extractFeatures(ocrResults, context) {
    const text = ocrResults.map(r => r.text).join(' ').toLowerCase();
    
    // Extrai horários
    const times = this.extractTimes(ocrResults);
    
    return [
      times.length,
      times.length > 0 ? times[0].hour : 0,
      times.length > 0 ? times[times.length - 1].hour : 0,
      text.includes('hoje') ? 1 : 0,
      text.includes('ontem') ? 1 : 0,
      /segunda|terça|quarta|quinta|sexta|sábado|domingo/.test(text) ? 1 : 0,
      /\d{1,2}\/\d{1,2}/.test(text) ? 1 : 0,
      context.exif?.month || 0,
      context.exif?.day || 0,
      context.exif?.year || 2025
    ];
  }

  extractTimes(ocrResults) {
    const timePattern = /(\d{1,2}):(\d{2})/;
    const times = [];
    
    ocrResults.forEach(result => {
      const match = result.text.match(timePattern);
      if (match) {
        times.push({
          hour: parseInt(match[1]),
          minute: parseInt(match[2])
        });
      }
    });
    
    return times.sort((a, b) => 
      (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)
    );
  }

  formatDate(month, day, year) {
    const m = Math.max(1, Math.min(12, Math.round(month)));
    const d = Math.max(1, Math.min(31, Math.round(day)));
    const y = Math.round(year);
    
    return `${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}-${y}`;
  }

  calculateConfidence(prediction) {
    // Confiança baseada em quão "arredondados" são os valores
    const [month, day, year] = prediction;
    
    const monthError = Math.abs(month - Math.round(month));
    const dayError = Math.abs(day - Math.round(day));
    const yearError = Math.abs(year - Math.round(year));
    
    const avgError = (monthError + dayError + yearError) / 3;
    
    return Math.max(0, 1 - avgError);
  }

  createModel() {
    const model = tf.sequential();
    
    // Input layer
    model.add(tf.layers.dense({
      inputShape: [10],
      units: 64,
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));
    
    // Dropout para regularização
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    // Hidden layer
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));
    
    // Output layer (month, day, year)
    model.add(tf.layers.dense({
      units: 3,
      activation: 'linear'
    }));
    
    // Compile
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });
    
    return model;
  }

  async train(trainingData) {
    console.log(`Training with ${trainingData.length} samples...`);
    
    // Prepara dados
    const X = trainingData.map(d => d.features);
    const y = trainingData.map(d => d.labels);
    
    const xTensor = tf.tensor2d(X);
    const yTensor = tf.tensor2d(y);
    
    // Cria ou carrega modelo
    if (!this.model) {
      this.model = this.createModel();
    }
    
    // Treinamento
    const history = await this.model.fit(xTensor, yTensor, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
          }
        }
      }
    });
    
    // Cleanup
    xTensor.dispose();
    yTensor.dispose();
    
    // Salva modelo
    await this.model.save(`file://${this.modelPath}`);
    console.log('Model saved');
    
    return history;
  }
}

module.exports = DatePredictor;
```

---

## 🖼️ Classificador de Layout

### Objetivo
Identificar o tipo de aplicativo que gerou o SMS (Android nativo, WhatsApp, Telegram, etc).

### Classes

```javascript
const LAYOUT_TYPES = {
  ANDROID_DEFAULT: 0,
  ANDROID_SAMSUNG: 1,
  IOS_DEFAULT: 2,
  WHATSAPP: 3,
  TELEGRAM: 4,
  UNKNOWN: 5
};
```

### Features

```javascript
function extractLayoutFeatures(ocrResults, imageMetadata) {
  return [
    // Posições relativas
    this.getSenderYPosition(ocrResults),
    this.getDateYPosition(ocrResults),
    this.getTimeAlignment(ocrResults),  // 0=left, 1=right
    
    // Densidade de texto
    this.getTextDensity(ocrResults),
    
    // Cores predominantes (do metadata)
    imageMetadata.dominantColor?.r || 0,
    imageMetadata.dominantColor?.g || 0,
    imageMetadata.dominantColor?.b || 0,
    
    // Aspectos visuais
    this.hasDateBanner(ocrResults) ? 1 : 0,
    this.hasHeader(ocrResults) ? 1 : 0,
    this.hasTimestamps(ocrResults) ? 1 : 0
  ];
}
```

### Implementação

```javascript
// src/ml/layoutClassifier.js
class LayoutClassifier {
  constructor() {
    this.model = null;
    this.modelPath = './data/models/layout_classifier';
  }

  async classify(ocrResults, imageMetadata) {
    await this.loadModel();
    
    const features = this.extractFeatures(ocrResults, imageMetadata);
    const tensor = tf.tensor2d([features]);
    
    const prediction = this.model.predict(tensor);
    const probabilities = await prediction.array();
    
    tensor.dispose();
    prediction.dispose();
    
    // Retorna classe com maior probabilidade
    const classIndex = probabilities[0].indexOf(Math.max(...probabilities[0]));
    const confidence = probabilities[0][classIndex];
    
    return {
      layout: Object.keys(LAYOUT_TYPES)[classIndex],
      confidence: confidence,
      probabilities: probabilities[0]
    };
  }

  createModel() {
    const model = tf.sequential();
    
    model.add(tf.layers.dense({
      inputShape: [10],
      units: 32,
      activation: 'relu'
    }));
    
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    model.add(tf.layers.dense({
      units: 16,
      activation: 'relu'
    }));
    
    // Output: 6 classes (tipos de layout)
    model.add(tf.layers.dense({
      units: 6,
      activation: 'softmax'
    }));
    
    model.compile({
      optimizer: 'adam',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });
    
    return model;
  }
}

module.exports = LayoutClassifier;
```

---

## 🔍 Reconhecedor de Padrões

### Objetivo
Identificar padrões conhecidos de remetentes (bancos, serviços, empresas).

### Implementação

```javascript
// src/ml/patternRecognizer.js
class PatternRecognizer {
  constructor() {
    this.patterns = {
      // Bancos
      banks: [
        /banco\s+(inter|itau|bradesco|santander|caixa)/i,
        /\b(nubank|c6|original)\b/i
      ],
      
      // Transportes
      transport: [
        /\b(uber|99|cabify)\b/i,
        /\b(ifood|rappi)\b/i
      ],
      
      // Serviços
      services: [
        /\b(netflix|spotify|amazon)\b/i,
        /\b(google|microsoft|apple)\b/i
      ],
      
      // Shortcodes (5 dígitos)
      shortcode: /^\d{4,5}$/
    };
  }

  recognize(text) {
    const results = [];
    
    for (const [category, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          results.push({
            category: category,
            confidence: 0.9,
            matched: text.match(pattern)[0]
          });
        }
      }
    }
    
    return results.length > 0 ? results[0] : null;
  }

  // Extrai features para ML
  extractFeatures(text) {
    return {
      hasNumbers: /\d/.test(text),
      hasUpperCase: /[A-Z]/.test(text),
      hasLowerCase: /[a-z]/.test(text),
      length: text.length,
      wordCount: text.split(/\s+/).length,
      isShortcode: /^\d{4,5}$/.test(text),
      hasSpecialChars: /[^a-zA-Z0-9\s]/.test(text)
    };
  }
}

module.exports = PatternRecognizer;
```

---

## 🔄 Pipeline de Treinamento

### Dataset

#### Estrutura
```
data/
├── training/
│   ├── raw/                    # Screenshots originais
│   │   ├── android_001.png
│   │   ├── ios_002.png
│   │   └── ...
│   │
│   ├── labels/                 # Labels manuais
│   │   ├── android_001.json
│   │   ├── ios_002.json
│   │   └── ...
│   │
│   └── processed/              # Features extraídas
│       ├── features.json
│       └── labels.json
```

#### Formato de Label
```json
{
  "filename": "android_001.png",
  "date": "06-09-2025",
  "sender": "BancoInter",
  "layout": "ANDROID_DEFAULT",
  "messages": [
    {
      "time": "09:30",
      "body": "Seu pagamento foi aprovado"
    }
  ],
  "metadata": {
    "verified": true,
    "annotator": "human",
    "timestamp": "2025-06-15T10:30:00Z"
  }
}
```

### Script de Treinamento

```javascript
// scripts/train.js
const fs = require('fs');
const path = require('path');
const DatePredictor = require('../src/ml/datePredictor');
const LayoutClassifier = require('../src/ml/layoutClassifier');

async function trainModels() {
  console.log('Loading training data...');
  
  // Carrega dados
  const rawData = loadRawData('./data/training');
  console.log(`Loaded ${rawData.length} samples`);
  
  // Processa dados
  const processedData = await processTrainingData(rawData);
  
  // Separa treino/validação (80/20)
  const splitIndex = Math.floor(processedData.length * 0.8);
  const trainData = processedData.slice(0, splitIndex);
  const valData = processedData.slice(splitIndex);
  
  // Treina Date Predictor
  console.log('\n=== Training Date Predictor ===');
  const datePredictor = new DatePredictor();
  await datePredictor.train(trainData.map(d => ({
    features: d.dateFeatures,
    labels: d.dateLabels
  })));
  
  // Treina Layout Classifier
  console.log('\n=== Training Layout Classifier ===');
  const layoutClassifier = new LayoutClassifier();
  await layoutClassifier.train(trainData.map(d => ({
    features: d.layoutFeatures,
    labels: d.layoutLabels
  })));
  
  // Avalia modelos
  console.log('\n=== Evaluation ===');
  await evaluateModels(valData, datePredictor, layoutClassifier);
  
  console.log('\nTraining completed!');
}

function loadRawData(dataPath) {
  const rawDir = path.join(dataPath, 'raw');
  const labelsDir = path.join(dataPath, 'labels');
  
  const files = fs.readdirSync(rawDir)
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  
  return files.map(file => {
    const labelFile = file.replace(/\.(png|jpg)$/, '.json');
    const labelPath = path.join(labelsDir, labelFile);
    
    if (!fs.existsSync(labelPath)) {
      console.warn(`Label not found for ${file}`);
      return null;
    }
    
    const label = JSON.parse(fs.readFileSync(labelPath, 'utf8'));
    
    return {
      image: path.join(rawDir, file),
      label: label
    };
  }).filter(Boolean);
}

async function processTrainingData(rawData) {
  const processed = [];
  
  for (const item of rawData) {
    // Extrai OCR (usando pipeline real)
    const pipeline = new SMSExtractionPipeline();
    const preprocessed = await pipeline.preprocess(item.image);
    const ocrResults = await pipeline.multiOCR(preprocessed);
    
    // Extrai features
    const dateFeatures = extractDateFeatures(ocrResults, item.label);
    const layoutFeatures = extractLayoutFeatures(ocrResults);
    
    // Prepara labels
    const dateLabels = parseDateToArray(item.label.date);
    const layoutLabels = oneHotEncode(item.label.layout);
    
    processed.push({
      dateFeatures,
      dateLabels,
      layoutFeatures,
      layoutLabels
    });
  }
  
  return processed;
}

function parseDateToArray(dateStr) {
  // "06-09-2025" → [6, 9, 2025]
  const [month, day, year] = dateStr.split('-').map(Number);
  return [month, day, year];
}

function oneHotEncode(layout) {
  const classes = Object.keys(LAYOUT_TYPES);
  const encoded = new Array(classes.length).fill(0);
  const index = classes.indexOf(layout);
  if (index >= 0) {
    encoded[index] = 1;
  }
  return encoded;
}

async function evaluateModels(valData, datePredictor, layoutClassifier) {
  let dateCorrect = 0;
  let layoutCorrect = 0;
  
  for (const item of valData) {
    // Avalia Date Predictor
    const datePred = await datePredictor.predict(null, {
      features: item.dateFeatures
    });
    const dateTrue = formatDateArray(item.dateLabels);
    if (datePred.date === dateTrue) {
      dateCorrect++;
    }
    
    // Avalia Layout Classifier
    const layoutPred = await layoutClassifier.classify(item.layoutFeatures);
    const layoutTrue = item.layoutLabels.indexOf(1);
    if (layoutPred.layout === Object.keys(LAYOUT_TYPES)[layoutTrue]) {
      layoutCorrect++;
    }
  }
  
  console.log(`Date Accuracy: ${(dateCorrect / valData.length * 100).toFixed(2)}%`);
  console.log(`Layout Accuracy: ${(layoutCorrect / valData.length * 100).toFixed(2)}%`);
}

// Executa
if (require.main === module) {
  trainModels().catch(console.error);
}
```

---

## 🔁 Feedback Loop

### Aprendizado Contínuo

```javascript
// src/ml/feedbackLoop.js
class FeedbackLoop {
  constructor() {
    this.trainingQueue = [];
    this.minSamplesForRetraining = 100;
    this.isRetraining = false;
  }

  async addCorrection(extraction, correction) {
    // Armazena caso para treinamento futuro
    const trainingCase = {
      features: this.extractFeatures(extraction),
      labels: this.extractLabels(correction),
      timestamp: Date.now()
    };
    
    this.trainingQueue.push(trainingCase);
    
    // Salva no banco
    await db.run(`
      INSERT INTO corrections (extraction_id, field, original_value, corrected_value)
      VALUES (?, ?, ?, ?)
    `, [
      extraction.id,
      'full',
      JSON.stringify(extraction),
      JSON.stringify(correction)
    ]);
    
    console.log(`Feedback added. Queue size: ${this.trainingQueue.length}`);
    
    // Retreina se atingiu threshold
    if (this.trainingQueue.length >= this.minSamplesForRetraining) {
      await this.retrain();
    }
  }

  async retrain() {
    if (this.isRetraining) {
      console.log('Already retraining, skipping...');
      return;
    }
    
    this.isRetraining = true;
    
    try {
      console.log(`Retraining with ${this.trainingQueue.length} new samples...`);
      
      const datePredictor = new DatePredictor();
      await datePredictor.loadModel();
      
      // Retreina incrementalmente
      await datePredictor.train(this.trainingQueue);
      
      // Limpa queue
      this.trainingQueue = [];
      
      console.log('Retraining completed!');
      
    } catch (error) {
      console.error('Retraining failed:', error);
    } finally {
      this.isRetraining = false;
    }
  }

  extractFeatures(extraction) {
    // Mesmo processo de extração de features usado no treinamento
    return {
      dateFeatures: [...],
      layoutFeatures: [...]
    };
  }

  extractLabels(correction) {
    // Converte correção humana em labels para treinamento
    return {
      dateLabels: parseDateToArray(correction.dataReal),
      layoutLabels: oneHotEncode(correction.layout)
    };
  }
}

module.exports = FeedbackLoop;
```

---

## 📊 Métricas de Performance

### Monitoramento do ML

```javascript
// src/ml/metrics.js
class MLMetrics {
  async recordPrediction(modelName, prediction, actual, confidence) {
    const isCorrect = prediction === actual;
    
    await db.run(`
      INSERT INTO ml_predictions (model, prediction, actual, confidence, is_correct, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `, [modelName, prediction, actual, confidence, isCorrect ? 1 : 0]);
  }

  async getModelAccuracy(modelName, timeWindow = '7 days') {
    const result = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(is_correct) as correct,
        AVG(confidence) as avg_confidence
      FROM ml_predictions
      WHERE model = ? AND created_at >= datetime('now', '-${timeWindow}')
    `, [modelName]);
    
    return {
      accuracy: result.correct / result.total,
      avgConfidence: result.avg_confidence,
      sampleSize: result.total
    };
  }
}
```

---

**Próximo:** [06-validation-rules.md](06-validation-rules.md) - Regras de Validação