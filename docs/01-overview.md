# SMS Extraction System v2.0 - Visão Geral

> **Versão:** 2.0  
> **Data:** 2025-11-18  
> **Autor:** Reinaldo Soares  
> **Acurácia Alvo:** 95%+

---

## 📑 Índice da Documentação

1. **[01-overview.md](01-overview.md)** ← Você está aqui
2. [02-architecture.md](02-architecture.md) - Arquitetura do Sistema
3. [03-pipeline-flow.md](03-pipeline-flow.md) - Fluxo de Processamento
4. [04-ocr-engines.md](04-ocr-engines.md) - Engines OCR e Integração
5. [05-ml-training.md](05-ml-training.md) - Machine Learning
6. [06-validation-rules.md](06-validation-rules.md) - Regras de Validação
7. [07-api-reference.md](07-api-reference.md) - API e Uso
8. [08-database-schema.md](08-database-schema.md) - Banco de Dados
9. [09-deployment.md](09-deployment.md) - Deploy e Infraestrutura
10. [10-troubleshooting.md](10-troubleshooting.md) - Solução de Problemas
11. [11-implementation-checklist.md](11-implementation-checklist.md) - Checklist de Implementação

---

## 🎯 O Que é Este Projeto?

Sistema avançado de **extração automática de dados de screenshots de SMS** com alta acurácia (95%+), utilizando:

- ✅ **Multi-OCR com votação** (3 engines)
- ✅ **Machine Learning** para predição de dados ausentes
- ✅ **Validação em múltiplas camadas**
- ✅ **Aprendizado contínuo** com feedback humano
- ✅ **Interface de revisão** para casos de baixa confiança

---

## 🆚 Comparação: Versão 1.0 vs 2.0

| Métrica | v1.0 | v2.0 | Melhoria |
|---------|------|------|----------|
| **Acurácia Geral** | ~70% | ~95% | +25% |
| **Detecção de Data** | ~60% | ~92% | +32% |
| **Identificação Remetente** | ~75% | ~93% | +18% |
| **Extração Mensagens** | ~80% | ~96% | +16% |
| **Tempo de Processamento** | ~5s | ~2.5s | -50% |
| **Taxa Revisão Manual** | ~30% | ~8% | -73% |
| **OCR Engines** | 1 (Tesseract) | 3 (Multi-OCR) | 3x |
| **Machine Learning** | ❌ | ✅ | Novo |
| **Sistema de Confiança** | ❌ | ✅ 0-100% | Novo |

---

## 📊 Resultados Esperados

### ROI (Return on Investment)
- **Redução de 73% no tempo de revisão manual**
- **95% de acurácia** vs 70% anterior
- **50% mais rápido** no processamento

### Métricas de Sucesso
```
├─ Processamento automático: 92%
├─ Revisão manual necessária: 8%
├─ Confiança média: 91%
└─ Taxa de erro: < 5%
```

---

## 🏗️ Arquitetura em Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT: Screenshot SMS                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 1: PRÉ-PROCESSAMENTO                                  │
│  • Rotação automática                                        │
│  • Melhoria de contraste                                     │
│  • Redução de ruído                                          │
│  • Normalização de resolução                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 2: MULTI-OCR COM VOTAÇÃO                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│  │Tesseract │  │ EasyOCR  │  │  Paddle  │                  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                  │
│       └─────────────┼─────────────┘                         │
│                     ▼                                        │
│            Sistema de Votação                                │
│         (Consensus Algorithm)                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 3: EXTRAÇÃO ESTRUTURADA                               │
│  • Data Real (ML + Regex + Heurísticas)                     │
│  • Remetente (Layout Detection + Patterns)                  │
│  • Mensagens (Block Detection + Time Association)            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 4: VALIDAÇÃO MULTI-CAMADA                             │
│  ✓ Schema Validation                                        │
│  ✓ Business Rules                                           │
│  ✓ Cross Validation                                         │
│  ✓ Anomaly Detection                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  FASE 5: DECISÃO POR CONFIANÇA                              │
│  ┌────────────────┬────────────────┐                        │
│  │ >= 85%         │ < 85%          │                        │
│  │ Automático ✓   │ Revisão Manual │                        │
│  └────────────────┴────────────────┘                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OUTPUT: JSON Estruturado + Nome de Arquivo                 │
│  {                                                           │
│    "remetente": "BancoInter",                               │
│    "dataReal": "06-09-2025",                                │
│    "mensagens": [...],                                      │
│    "confidence": { "overall": 95 }                          │
│  }                                                           │
│  → 2025-06-09_BancoInter_3msgs.json                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎓 Conceitos-Chave

### 1. **Multi-OCR com Votação**
Ao invés de confiar em um único OCR, o sistema:
- Executa 3 engines em paralelo
- Agrupa resultados por similaridade espacial
- Vota no texto mais comum
- Gera score de confiança baseado no consenso

**Exemplo:**
```
Tesseract: "Banco lnter" (confiança: 0.8)
EasyOCR:   "Banco Inter" (confiança: 0.95)
PaddleOCR: "Banco Inter" (confiança: 0.92)

Resultado votado: "Banco Inter" (confiança: 0.89)
```

### 2. **Sistema de Confiança (0-100%)**
Cada extração recebe um score baseado em:
- Qualidade do OCR (25%)
- Confiança na data (25%)
- Confiança no remetente (20%)
- Completude das mensagens (20%)
- Validação geral (10%)

**Níveis de confiança:**
```
95-100%: EXCELLENT - Processamento automático
85-94%:  GOOD      - Processamento automático
70-84%:  ACCEPTABLE - Revisão recomendada
50-69%:  LOW       - Revisão obrigatória
0-49%:   CRITICAL  - Reprocessar ou descartar
```

### 3. **Machine Learning Predictivo**
Quando dados não são detectados diretamente (ex: data ausente):
- Modelo treinado com 10k+ exemplos
- Prediz baseado em contexto e padrões
- Aprende com correções humanas
- Retreina automaticamente a cada 100 novos casos

### 4. **Aprendizado Contínuo**
```
Extração → Revisão Humana → Feedback Loop → Retreinamento
```
O sistema melhora automaticamente com o uso.

---

## 💾 Formato de Saída

### JSON Estruturado
```json
{
  "id": "Screenshot_20250609-031245.png",
  "remetente": "BancoInter",
  "dataReal": "06-09-2025",
  "mensagens": [
    {
      "hora": "09:30",
      "corpo": "Seu pagamento foi aprovado",
      "data": "06-09-2025",
      "confidence": 0.96
    },
    {
      "hora": "09:31",
      "corpo": "Valor: R$ 150,00",
      "data": "06-09-2025",
      "confidence": 0.94
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
    "preprocessingApplied": [
      "rotation_correction",
      "contrast_enhancement",
      "noise_reduction"
    ]
  }
}
```

### Nome de Arquivo Gerado
```
Formato: YYYY-MM-DD_Remetente_NmsgS.json

Exemplos:
2025-06-09_BancoInter_3msgs.json
2025-06-10_Uber_1msg.json
2025-06-11_Netflix_5msgs.json
```

---

## 🚀 Casos de Uso

### 1. Processamento Individual
```bash
node main.js screenshot.png
```

### 2. Processamento em Lote
```bash
node main.js batch ./screenshots
```

### 3. Via API
```javascript
const response = await fetch('http://localhost:3000/api/extract', {
  method: 'POST',
  body: formData
});
```

### 4. Interface de Revisão
```
http://localhost:3000/dashboard/review
```

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js 18+** - Runtime principal
- **Python 3.8+** - OCR engines (EasyOCR, PaddleOCR)
- **TensorFlow.js** - Machine Learning
- **Sharp** - Processamento de imagens

### OCR Engines
- **Tesseract 5.0+** (via tesseract.js)
- **EasyOCR** (via microserviço Python)
- **PaddleOCR** (via microserviço Python)

### Armazenamento
- **SQLite** - Banco principal
- **Redis** - Cache e sessões

### Monitoramento
- **Winston** - Logging estruturado
- **Prometheus** - Métricas
- **Grafana** - Dashboard

---

## 📈 Roadmap

### Versão Atual (2.0)
- ✅ Multi-OCR com votação
- ✅ ML predictivo
- ✅ Sistema de confiança
- ✅ Interface de revisão
- ✅ Aprendizado contínuo

### Próximas Versões

**v2.1 (Q1 2025)**
- [ ] Suporte a múltiplos idiomas
- [ ] API GraphQL
- [ ] WebSocket para processamento real-time
- [ ] Mobile app para revisão

**v2.2 (Q2 2025)**
- [ ] OCR em GPU (CUDA)
- [ ] Clustering automático de remetentes
- [ ] Export para múltiplos formatos (CSV, Excel)
- [ ] Integração com Zapier/Make

**v3.0 (Q3 2025)**
- [ ] Deep Learning (BERT) para NER
- [ ] Detecção automática de idioma
- [ ] Processamento de vídeos
- [ ] Cloud-native (Kubernetes)

---

## 📚 Como Navegar Esta Documentação

1. **Iniciante?** Comece por:
   - 01-overview.md (este arquivo)
   - 07-api-reference.md (como usar)
   - 11-implementation-checklist.md (como implementar)

2. **Desenvolvedor?** Foque em:
   - 02-architecture.md (estrutura)
   - 03-pipeline-flow.md (lógica)
   - 04-ocr-engines.md (integração)

3. **DevOps?** Veja:
   - 08-database-schema.md (dados)
   - 09-deployment.md (infraestrutura)
   - 10-troubleshooting.md (problemas comuns)

4. **Data Scientist?** Consulte:
   - 05-ml-training.md (modelos)
   - 06-validation-rules.md (regras)

---

## 🆘 Suporte

- **Issues:** [GitHub Issues](https://github.com/Reinaldo-rs/sms-extraction/blob/main/issues/issues.md)
- **Email:** reinaldo.rsoares@hotmail.com

---

## 📄 Licença

Este projeto está sob licença MIT. Para mais detalhes entre em contato.

---

**Próximo:** [02-architecture.md](02-architecture.md) - Arquitetura Detalhada do Sistema