# 06 - Regras de Validação

> **Navegação:** [← ML Training](05-ml-training.md) | [API Reference →](07-api-reference.md)

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Schema Validator](#schema-validator)
3. [Business Rules Validator](#business-rules-validator)
4. [Cross Validator](#cross-validator)
5. [Anomaly Detector](#anomaly-detector)
6. [Casos Edge](#casos-edge)

---

## 🎯 Visão Geral

### Camadas de Validação

```
Extraction
    │
    ▼
┌─────────────────┐
│ Schema Validator│  ✓ Estrutura JSON correta
└────────┬────────┘
         ▼
┌─────────────────┐
│ Business Rules  │  ✓ Regras de negócio
└────────┬────────┘
         ▼
┌─────────────────┐
│ Cross Validator │  ✓ Consistência entre campos
└────────┬────────┘
         ▼
┌─────────────────┐
│Anomaly Detector │  ✓ Detecta outliers
└────────┬────────┘
         ▼
    Valid? (≥85%)
```

### Severidade de Issues

```javascript
const SEVERITY = {
  ERROR: 3,      // Bloqueia processamento
  WARNING: 2,    // Reduz confiança
  INFO: 1        // Apenas informativo
};
```

---

## 📋 Schema Validator

### JSON Schema

```javascript
// schemas/extraction.schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["id", "remetente", "dataReal", "mensagens", "metadata"],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "pattern": "^[a-zA-Z0-9._-]+\\.(png|jpg|jpeg)$",
      "description": "Nome do arquivo original"
    },
    "remetente": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "pattern": "^[a-zA-Z0-9\\s._-]+$"
    },
    "dataReal": {
      "type": "string",
      "pattern": "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])-\\d{4}$",
      "description": "Formato: MM-DD-YYYY"
    },
    "mensagens": {
      "type": "array",
      "minItems": 1,
      "maxItems": 100,
      "items": {
        "type": "object",
        "required": ["hora", "corpo", "data"],
        "properties": {
          "hora": {
            "type": "string",
            "pattern": "^([01]\\d|2[0-3]):([0-5]\\d)$",
            "minLength": 5,
            "maxLength": 5
          },
          "corpo": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1000
          },
          "data": {
            "type": "string",
            "pattern": "^(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])-\\d{4}$"
          },
          "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "required": ["confidence"],
      "properties": {
        "confidence": {
          "type": "object",
          "required": ["overall", "date", "sender", "messages"],
          "properties": {
            "overall": { "type": "number", "minimum": 0, "maximum": 100 },
            "date": { "type": "number", "minimum": 0, "maximum": 100 },
            "sender": { "type": "number", "minimum": 0, "maximum": 100 },
            "messages": { "type": "number", "minimum": 0, "maximum": 100 }
          }
        },
        "processingTime": { "type": "integer", "minimum": 0 },
        "ocrEngine": { "type": "string" },
        "extractionMethods": { "type": "object" }
      }
    }
  }
}
```

### Implementação

```javascript
// src/validation/schemaValidator.js
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../../schemas/extraction.schema.json');

class SchemaValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    this.validate = this.ajv.compile(schema);
  }

  validate(extraction) {
    const isValid = this.validate(extraction);
    
    if (!isValid) {
      const issues = this.validate.errors.map(error => ({
        type: 'SCHEMA_ERROR',
        severity: 'ERROR',
        field: error.instancePath,
        message: error.message,
        detail: error
      }));
      
      return {
        isValid: false,
        issues: issues,
        score: 0
      };
    }
    
    return {
      isValid: true,
      issues: [],
      score: 1.0
    };
  }
}

module.exports = SchemaValidator;
```

---

## 📏 Business Rules Validator

### Regras Implementadas

```javascript
// src/validation/businessRules.js
class BusinessRulesValidator {
  constructor() {
    this.rules = [
      this.validateDateRange,
      this.validateTimesSequential,
      this.validateSenderFormat,
      this.validateMessageCompleteness,
      this.validateMessageQuality,
      this.validateDataConsistency
    ];
  }

  async validate(extraction) {
    const issues = [];
    let score = 1.0;
    
    for (const rule of this.rules) {
      const result = await rule.call(this, extraction);
      
      if (!result.valid) {
        issues.push(...result.issues);
        score -= result.penalty;
      }
    }
    
    return {
      isValid: score >= 0.7,
      issues: issues,
      score: Math.max(0, score)
    };
  }

  // REGRA 1: Data deve estar em range válido
  validateDateRange(extraction) {
    const date = this.parseDate(extraction.dataReal);
    const now = new Date();
    const minDate = new Date('2010-01-01');
    const maxDate = new Date(now.getFullYear() + 1, 11, 31);
    
    const issues = [];
    let valid = true;
    
    // Data no futuro
    if (date > now) {
      issues.push({
        type: 'FUTURE_DATE',
        severity: 'WARNING',
        field: 'dataReal',
        message: `Data está no futuro: ${extraction.dataReal}`,
        suggestion: 'Verificar se a data foi extraída corretamente'
      });
      valid = false;
    }
    
    // Data muito antiga
    if (date < minDate) {
      issues.push({
        type: 'DATE_TOO_OLD',
        severity: 'WARNING',
        field: 'dataReal',
        message: `Data anterior a 2010: ${extraction.dataReal}`,
        suggestion: 'Verificar se o ano foi extraído corretamente'
      });
      valid = false;
    }
    
    // Data muito futura
    if (date > maxDate) {
      issues.push({
        type: 'DATE_TOO_FUTURE',
        severity: 'ERROR',
        field: 'dataReal',
        message: `Data muito no futuro: ${extraction.dataReal}`,
        suggestion: 'Reprocessar extração de data'
      });
      valid = false;
    }
    
    return {
      valid: issues.length === 0,
      issues: issues,
      penalty: issues.length > 0 ? 0.2 : 0
    };
  }

  // REGRA 2: Horários devem ser sequenciais
  validateTimesSequential(extraction) {
    const times = extraction.mensagens.map(m => {
      const [hour, minute] = m.hora.split(':').map(Number);
      return hour * 60 + minute;
    });
    
    let isSequential = true;
    const issues = [];
    
    for (let i = 1; i < times.length; i++) {
      if (times[i] < times[i - 1]) {
        isSequential = false;
        issues.push({
          type: 'NON_SEQUENTIAL_TIMES',
          severity: 'WARNING',
          field: `mensagens[${i}].hora`,
          message: `Horário fora de ordem: ${extraction.mensagens[i].hora} após ${extraction.mensagens[i-1].hora}`,
          suggestion: 'Verificar se mensagens foram extraídas na ordem correta'
        });
      }
    }
    
    return {
      valid: isSequential,
      issues: issues,
      penalty: isSequential ? 0 : 0.1
    };
  }

  // REGRA 3: Remetente deve ter formato válido
  validateSenderFormat(extraction) {
    const sender = extraction.remetente;
    const issues = [];
    
    // Remetente desconhecido
    if (sender === 'UNKNOWN' || !sender) {
      issues.push({
        type: 'UNKNOWN_SENDER',
        severity: 'WARNING',
        field: 'remetente',
        message: 'Remetente não identificado',
        suggestion: 'Revisar manualmente'
      });
    }
    
    // Remetente muito curto
    if (sender.length < 3) {
      issues.push({
        type: 'SENDER_TOO_SHORT',
        severity: 'WARNING',
        field: 'remetente',
        message: `Remetente muito curto: "${sender}"`,
        suggestion: 'Verificar se foi extraído completamente'
      });
    }
    
    // Remetente com caracteres inválidos
    if (/[<>{}[\]\\|`]/.test(sender)) {
      issues.push({
        type: 'SENDER_INVALID_CHARS',
        severity: 'ERROR',
        field: 'remetente',
        message: `Remetente contém caracteres inválidos: "${sender}"`,
        suggestion: 'Limpar caracteres especiais'
      });
    }
    
    return {
      valid: issues.length === 0,
      issues: issues,
      penalty: issues.length > 0 ? 0.15 : 0
    };
  }

  // REGRA 4: Mensagens devem estar completas
  validateMessageCompleteness(extraction) {
    const issues = [];
    
    extraction.mensagens.forEach((msg, index) => {
      // Verifica texto cortado
      if (msg.corpo.endsWith('...') || msg.corpo.includes('…')) {
        issues.push({
          type: 'MESSAGE_TRUNCATED',
          severity: 'WARNING',
          field: `mensagens[${index}].corpo`,
          message: `Mensagem parece estar cortada: "${msg.corpo.substring(0, 50)}..."`,
          suggestion: 'Verificar se imagem contém mensagem completa'
        });
      }
      
      // Verifica mensagens muito curtas
      if (msg.corpo.length < 3) {
        issues.push({
          type: 'MESSAGE_TOO_SHORT',
          severity: 'WARNING',
          field: `mensagens[${index}].corpo`,
          message: `Mensagem muito curta: "${msg.corpo}"`,
          suggestion: 'Pode ser ruído do OCR'
        });
      }
      
      // Verifica mensagens muito longas (possível erro)
      if (msg.corpo.length > 500) {
        issues.push({
          type: 'MESSAGE_TOO_LONG',
          severity: 'INFO',
          field: `mensagens[${index}].corpo`,
          message: `Mensagem muito longa: ${msg.corpo.length} caracteres`,
          suggestion: 'Pode conter múltiplas mensagens concatenadas'
        });
      }
    });
    
    return {
      valid: issues.filter(i => i.severity === 'ERROR').length === 0,
      issues: issues,
      penalty: issues.filter(i => i.severity !== 'INFO').length * 0.05
    };
  }

  // REGRA 5: Qualidade das mensagens
  validateMessageQuality(extraction) {
    const issues = [];
    
    extraction.mensagens.forEach((msg, index) => {
      // Calcula ratio de caracteres válidos
      const validChars = [...msg.corpo].filter(c => 
        /[\p{L}\p{N}\p{Emoji}\s.,;:!?()\-]/u.test(c)
      );
      const ratio = validChars.length / [...msg.corpo].length;
      
      if (ratio < 0.7) {
        issues.push({
          type: 'MESSAGE_LOW_QUALITY',
          severity: 'WARNING',
          field: `mensagens[${index}].corpo`,
          message: `Mensagem com muitos caracteres inválidos (${(ratio * 100).toFixed(0)}% válidos)`,
          suggestion: 'Pode ser erro de OCR, revisar manualmente',
          detail: { ratio: ratio, text: msg.corpo.substring(0, 50) }
        });
      }
    });
    
    return {
      valid: issues.length === 0,
      issues: issues,
      penalty: issues.length * 0.1
    };
  }

  // REGRA 6: Consistência entre campos
  validateDataConsistency(extraction) {
    const issues = [];
    
    // Todas as mensagens devem ter a mesma data
    const dates = new Set(extraction.mensagens.map(m => m.data));
    
    if (dates.size > 1) {
      issues.push({
        type: 'INCONSISTENT_DATES',
        severity: 'ERROR',
        field: 'mensagens[].data',
        message: `Mensagens têm datas diferentes: ${[...dates].join(', ')}`,
        suggestion: 'Verificar se dataReal foi propagada corretamente'
      });
    }
    
    // Data das mensagens deve ser igual à dataReal
    if (dates.size === 1 && [...dates][0] !== extraction.dataReal) {
      issues.push({
        type: 'DATE_MISMATCH',
        severity: 'ERROR',
        field: 'dataReal',
        message: `dataReal (${extraction.dataReal}) diferente da data das mensagens (${[...dates][0]})`,
        suggestion: 'Corrigir inconsistência'
      });
    }
    
    return {
      valid: issues.filter(i => i.severity === 'ERROR').length === 0,
      issues: issues,
      penalty: issues.length > 0 ? 0.3 : 0
    };
  }

  // Helper: Parse date string
  parseDate(dateStr) {
    const [month, day, year] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
}

module.exports = BusinessRulesValidator;
```

---

## 🔄 Cross Validator

### Validação Cruzada entre Campos

```javascript
// src/validation/crossValidator.js
class CrossValidator {
  async validate(extraction) {
    const issues = [];
    let score = 1.0;
    
    // 1. Valida consistência de confiança
    const confidenceIssues = this.validateConfidenceConsistency(extraction);
    issues.push(...confidenceIssues);
    
    // 2. Valida relação entre campos
    const relationIssues = this.validateFieldRelations(extraction);
    issues.push(...relationIssues);
    
    // 3. Valida metadata
    const metadataIssues = this.validateMetadata(extraction);
    issues.push(...metadataIssues);
    
    // Calcula penalty
    const errorCount = issues.filter(i => i.severity === 'ERROR').length;
    const warningCount = issues.filter(i => i.severity === 'WARNING').length;
    score -= (errorCount * 0.2 + warningCount * 0.1);
    
    return {
      isValid: score >= 0.7,
      issues: issues,
      score: Math.max(0, score)
    };
  }

  validateConfidenceConsistency(extraction) {
    const issues = [];
    const conf = extraction.metadata.confidence;
    
    // Overall deve ser aproximadamente a média dos outros
    const avgPartialConf = (conf.date + conf.sender + conf.messages) / 3;
    const diff = Math.abs(conf.overall - avgPartialConf);
    
    if (diff > 15) {
      issues.push({
        type: 'CONFIDENCE_INCONSISTENT',
        severity: 'WARNING',
        field: 'metadata.confidence',
        message: `Confiança geral (${conf.overall}) muito diferente da média parcial (${avgPartialConf.toFixed(0)})`,
        suggestion: 'Recalcular confiança geral'
      });
    }
    
    // Se alguma confiança parcial é muito baixa, overall não pode ser alta
    const minPartialConf = Math.min(conf.date, conf.sender, conf.messages);
    
    if (minPartialConf < 70 && conf.overall > 85) {
      issues.push({
        type: 'CONFIDENCE_TOO_HIGH',
        severity: 'ERROR',
        field: 'metadata.confidence.overall',
        message: `Confiança geral ${conf.overall} muito alta considerando confiança mínima parcial de ${minPartialConf}`,
        suggestion: 'Ajustar cálculo de confiança'
      });
    }
    
    return issues;
  }

  validateFieldRelations(extraction) {
    const issues = [];
    
    // Se há poucas mensagens E baixa confiança no sender, pode ser problema
    if (extraction.mensagens.length < 2 && extraction.metadata.confidence.sender < 70) {
      issues.push({
        type: 'INSUFFICIENT_DATA',
        severity: 'WARNING',
        field: 'mensagens',
        message: 'Poucas mensagens e remetente com baixa confiança',
        suggestion: 'Revisar manualmente'
      });
    }
    
    // Se método de extração de data foi ML com baixa confiança, flag
    if (extraction.metadata.extractionMethods?.date === 'ml_prediction' && 
        extraction.metadata.confidence.date < 75) {
      issues.push({
        type: 'ML_LOW_CONFIDENCE',
        severity: 'WARNING',
        field: 'dataReal',
        message: 'Data extraída por ML com baixa confiança',
        suggestion: 'Revisar data manualmente'
      });
    }
    
    return issues;
  }

  validateMetadata(extraction) {
    const issues = [];
    
    // Processing time muito alto pode indicar problema
    if (extraction.metadata.processingTime > 10000) {
      issues.push({
        type: 'SLOW_PROCESSING',
        severity: 'INFO',
        field: 'metadata.processingTime',
        message: `Processamento lento: ${extraction.metadata.processingTime}ms`,
        suggestion: 'Verificar performance do sistema'
      });
    }
    
    // Deve haver pelo menos um método de extração
    if (!extraction.metadata.extractionMethods || 
        Object.keys(extraction.metadata.extractionMethods).length === 0) {
      issues.push({
        type: 'MISSING_EXTRACTION_METHODS',
        severity: 'WARNING',
        field: 'metadata.extractionMethods',
        message: 'Métodos de extração não registrados',
        suggestion: 'Adicionar metadados de extração'
      });
    }
    
    return issues;
  }
}

module.exports = CrossValidator;
```

---

## 🚨 Anomaly Detector

### Detecção de Outliers

```javascript
// src/validation/anomalyDetector.js
class AnomalyDetector {
  constructor() {
    this.statistics = null;
  }

  async loadStatistics() {
    // Carrega estatísticas históricas do banco
    this.statistics = await db.get(`
      SELECT 
        AVG(LENGTH(sender)) as avg_sender_length,
        AVG(json_array_length(messages_json)) as avg_message_count,
        AVG(processing_time_ms) as avg_processing_time,
        AVG(confidence_overall) as avg_confidence
      FROM extractions
      WHERE created_at >= datetime('now', '-30 days')
    `);
  }

  async validate(extraction) {
    await this.loadStatistics();
    
    const issues = [];
    let score = 1.0;
    
    // Detecta anomalias
    const anomalies = [
      this.detectSenderAnomaly(extraction),
      this.detectMessageCountAnomaly(extraction),
      this.detectConfidenceAnomaly(extraction),
      this.detectTimeAnomaly(extraction)
    ].filter(Boolean);
    
    issues.push(...anomalies);
    
    // Cada anomalia reduz score
    score -= anomalies.length * 0.1;
    
    return {
      isValid: anomalies.filter(a => a.severity === 'ERROR').length === 0,
      issues: anomalies,
      score: Math.max(0, score)
    };
  }

  detectSenderAnomaly(extraction) {
    const senderLength = extraction.remetente.length;
    const avgLength = this.statistics.avg_sender_length;
    
    // Se remetente é muito mais longo que a média
    if (senderLength > avgLength * 3) {
      return {
        type: 'SENDER_LENGTH_ANOMALY',
        severity: 'WARNING',
        field: 'remetente',
        message: `Remetente anormalmente longo: ${senderLength} chars (média: ${avgLength.toFixed(0)})`,
        suggestion: 'Pode conter texto extra do OCR'
      };
    }
    
    return null;
  }

  detectMessageCountAnomaly(extraction) {
    const count = extraction.mensagens.length;
    const avgCount = this.statistics.avg_message_count;
    
    // Muito mais mensagens que o normal
    if (count > avgCount * 5) {
      return {
        type: 'MESSAGE_COUNT_ANOMALY',
        severity: 'INFO',
        field: 'mensagens',
        message: `Número anormal de mensagens: ${count} (média: ${avgCount.toFixed(0)})`,
        suggestion: 'Conversa muito longa, verificar se foi extraída corretamente'
      };
    }
    
    return null;
  }

  detectConfidenceAnomaly(extraction) {
    const conf = extraction.metadata.confidence.overall;
    const avgConf = this.statistics.avg_confidence;
    
    // Confiança muito abaixo da média
    if (conf < avgConf - 20) {
      return {
        type: 'LOW_CONFIDENCE_ANOMALY',
        severity: 'WARNING',
        field: 'metadata.confidence.overall',
        message: `Confiança abaixo da média: ${conf}% (média: ${avgConf.toFixed(0)}%)`,
        suggestion: 'Revisar manualmente'
      };
    }
    
    return null;
  }

  detectTimeAnomaly(extraction) {
    const time = extraction.metadata.processingTime;
    const avgTime = this.statistics.avg_processing_time;
    
    // Processamento muito mais lento que normal
    if (time > avgTime * 3) {
      return {
        type: 'PROCESSING_TIME_ANOMALY',
        severity: 'INFO',
        field: 'metadata.processingTime',
        message: `Processamento anormalmente lento: ${time}ms (média: ${avgTime.toFixed(0)}ms)`,
        suggestion: 'Verificar carga do sistema'
      };
    }
    
    return null;
  }
}

module.exports = AnomalyDetector;
```

---

## 🔍 Casos Edge

### Tratamentos Especiais

```javascript
// src/validation/edgeCases.js
class EdgeCaseValidator {
  validateEdgeCases(extraction) {
    const issues = [];
    
    // CASO 1: Mensagem única
    if (extraction.mensagens.length === 1) {
      issues.push({
        type: 'SINGLE_MESSAGE',
        severity: 'INFO',
        message: 'Apenas uma mensagem extraída',
        suggestion: 'Verificar se há mais mensagens na imagem'
      });
    }
    
    // CASO 2: Todos os horários iguais (provável erro)
    const uniqueTimes = new Set(extraction.mensagens.map(m => m.hora));
    if (uniqueTimes.size === 1 && extraction.mensagens.length > 1) {
      issues.push({
        type: 'DUPLICATE_TIMES',
        severity: 'ERROR',
        message: 'Todas as mensagens têm o mesmo horário',
        suggestion: 'Reprocessar detecção de horários'
      });
    }
    
    // CASO 3: Remetente numérico (shortcode)
    if (/^\d{4,5}$/.test(extraction.remetente)) {
      issues.push({
        type: 'SHORTCODE_SENDER',
        severity: 'INFO',
        message: `Remetente é shortcode: ${extraction.remetente}`,
        suggestion: 'Normal para SMS de serviços'
      });
    }
    
    // CASO 4: Mensagens com emojis
    const hasEmojis = extraction.mensagens.some(m => 
      /[\p{Emoji}]/u.test(m.corpo)
    );
    if (hasEmojis) {
      issues.push({
        type: 'CONTAINS_EMOJIS',
        severity: 'INFO',
        message: 'Mensagens contêm emojis',
        suggestion: 'Verificar se foram extraídos corretamente'
      });
    }
    
    return issues;
  }
}
```

---

**Próximo:** [07-api-reference.md](07-api-reference.md) - Referência da API