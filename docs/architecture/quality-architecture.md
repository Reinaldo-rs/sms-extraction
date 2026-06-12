# Quality Architecture (Arquitetura de Qualidade)

> **Navegação:** [← Pipeline Flow](../03-pipeline-flow.md) | [OCR Engines →](../04-ocr-engines.md)

---

# 📑 Índice

1. Visão Geral
2. Arquitetura
3. Responsabilidades
4. Fluxo de Execução
5. Perfis de Qualidade
6. Calibração de Thresholds
7. Estrutura de Diretórios
8. Boas Práticas
9. Roadmap

---

# 🎯 Visão Geral

O módulo de qualidade é responsável por:

* Analisar a qualidade técnica da imagem
* Detectar problemas que impactam o OCR
* Determinar quais ações de pré-processamento devem ser aplicadas
* Manter métricas e regras desacopladas

A arquitetura segue o princípio de **Separação de Responsabilidades (SRP)**, dividindo:

* Métricas
* Configuração
* Decisão
* Execução

em módulos independentes.

---

# 🏛️ Arquitetura

```text
┌───────────────────────────────────────────────┐
│               qualityConfig.js                │
│                                               │
│  • Thresholds                                │
│  • Pesos                                     │
│  • Perfis                                    │
│  • Configurações calibráveis                 │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│              qualityAnalyzer.js               │
│                                               │
│  • Resolução                                 │
│  • Legibilidade                              │
│  • Nitidez                                   │
│  • Contraste                                 │
│  • Brilho                                    │
│                                               │
│  Retorna apenas métricas                     │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│               qualityPolicy.js                │
│                                               │
│  • Calcula score geral                       │
│  • Avalia thresholds                         │
│  • Seleciona ações                           │
│  • Define prioridades                        │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                preprocessor.js                │
│                                               │
│  • Executa upscale                           │
│  • Executa sharpen                           │
│  • Ajusta contraste                          │
│  • Ajusta brilho                             │
└───────────────────────────────────────────────┘
```

---

# 📋 Responsabilidades

## qualityConfig.js

Responsável por centralizar valores configuráveis.

### Exemplos

```javascript
export const QUALITY_WEIGHTS = {}

export const QUALITY_THRESHOLDS = {}

export const QUALITY_PROFILES = {}
```

### Não deve conter

* lógica de negócio
* processamento de imagem
* decisões

---

## qualityAnalyzer.js

Responsável exclusivamente por medir qualidade.

### Métricas atuais

* Resolution
* Text Readability
* Sharpness
* Contrast
* Brightness

### Exemplo de retorno

```javascript
{
  metrics: {
    resolution: {},
    textReadability: {},
    sharpness: {},
    contrast: {},
    brightness: {}
  }
}
```

### Não deve conter

* recomendações
* ações
* decisões
* regras de negócio

---

## qualityPolicy.js

Responsável por interpretar métricas.

### Funções

* calcular score geral
* avaliar thresholds
* determinar necessidade de preprocessamento
* selecionar ações
* definir prioridade

### Exemplo

```javascript
{
  overallScore: 0.68,
  needsPreprocessing: true,
  actions: [
    {
      type: "upscale",
      priority: "high"
    }
  ]
}
```

### Não deve conter

* leitura de arquivos
* processamento Sharp
* OCR

---

## preprocessor.js

Responsável pela execução das ações.

### Exemplo

```javascript
const analysis = await analyzer.analyze(image)

const decisions = policy.evaluate(analysis)

await preprocessor.execute(image, decisions)
```

---

# 🔄 Fluxo de Execução

```text
Imagem
   │
   ▼
QualityAnalyzer
   │
   ▼
Métricas
   │
   ▼
QualityPolicy
   │
   ▼
Decisões
   │
   ▼
Preprocessor
   │
   ▼
Imagem Processada
```

---

# ⚙️ Perfis de Qualidade

O sistema suporta perfis distintos para diferentes cenários.

## SMS

Prioriza:

* textos pequenos
* legibilidade
* nitidez

Uso:

```javascript
const policy = new QualityPolicy({
  profile: 'SMS'
})
```

---

## DOCUMENT

Prioriza:

* resolução
* contraste
* preservação de detalhes

Uso:

```javascript
const policy = new QualityPolicy({
  profile: 'DOCUMENT'
})
```

---

## FAST

Prioriza:

* velocidade
* menor custo computacional

Uso:

```javascript
const policy = new QualityPolicy({
  profile: 'FAST'
})
```

---

# 📊 Calibração de Thresholds

Os thresholds atuais são heurísticos.

Para ambientes de produção recomenda-se calibrar utilizando um dataset real.

---

## Estrutura Recomendada

```text
tests/
└── datasets/
    └── quality-calibration/
        ├── images/
        ├── groundTruth.json
        └── calibration-report.json
```

---

## groundTruth.json

Contém a referência utilizada para comparação.

Exemplo:

```json
{
  "sms_001.png": {
    "ocrConfidence": 0.95,
    "textExtracted": "Mensagem exemplo",
    "hasSmallText": true
  }
}
```

---

## calibration-report.json

Gerado automaticamente pelo script de calibração.

Exemplo:

```json
{
  "optimalThresholds": {
    "textReadability": 0.62,
    "sharpness": 0.58,
    "contrast": 0.52,
    "brightness": 0.41
  }
}
```

---

## Script de Calibração

Localização:

```text
scripts/
└── ocrThresholdCalibrator.js
```

Execução:

```bash
node scripts/ocrThresholdCalibrator.js tests/datasets/quality-calibration
```

Objetivos:

* medir correlação entre métricas e OCR
* encontrar thresholds ótimos
* gerar relatório de calibração
* apoiar ajustes do qualityConfig.js

---

# 📁 Estrutura de Diretórios

```text
src/
├── preprocessing/
│   ├── imageEnhancer.js
│   ├── preprocessor.js
│   ├── qualityAnalyzer.js
│   ├── qualityConfig.js
│   ├── qualityPolicy.js
│   └── rotationDetector.js
│
├── ocr/
├── storage/
└── utils/

examples/
└── qualityPipelineExample.js

scripts/
└── ocrThresholdCalibrator.js

tests/
├── datasets/
│   └── quality-calibration/
│
├── images/
│   ├── quality/
│   └── rotation/
│
└── preprocessing/
    └── preprocessingSmokeTest.js
```

---

# ✅ Boas Práticas

## Fazer

* manter métricas separadas de decisões
* centralizar thresholds em qualityConfig.js
* adicionar novas métricas pelo Analyzer
* adicionar novas regras pelo Policy
* calibrar thresholds com dados reais

## Evitar

* decisões dentro do Analyzer
* métricas dentro do Policy
* números mágicos espalhados
* dependência direta entre Policy e Sharp
* mistura de análise com execução

---

# 🚀 Roadmap

## Curto Prazo

* [ ] Refinar métricas de legibilidade
* [ ] Refinar score de nitidez
* [ ] Melhorar sistema de prioridades
* [ ] Criar dataset de calibração

## Médio Prazo

* [ ] Testes unitários
* [ ] Calibração baseada em dataset real
* [ ] Benchmark de performance
* [ ] Perfis especializados

## Longo Prazo

* [ ] Predição baseada em Machine Learning
* [ ] Auto tuning de thresholds
* [ ] Seleção dinâmica de perfil
* [ ] Integração com múltiplas engines OCR

---

# 🎯 Objetivo Arquitetural

A meta desta arquitetura é permitir que:

* Métricas evoluam sem alterar regras
* Regras evoluam sem alterar processamento
* Processamento evolua sem alterar análise

mantendo o sistema modular, testável e preparado para crescimento futuro.
