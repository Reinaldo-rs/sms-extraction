# SMS Extraction v2.0

Sistema avançado de extração automática de dados de screenshots de SMS.

## Status
🚧 Em desenvolvimento

## Versão
2.0 (Fase 1 - Setup)

## Estrutura de diretórios
```
sms-extraction/
├── src/                          # Código-fonte principal
│   ├── preprocessing/            # Melhorias de imagem
│   ├── ocr/                      # Engines de OCR
│   ├── processor/                # Extração de dados
│   ├── ml/                       # Machine Learning
│   ├── validation/               # Validadores
│   ├── storage/                  # Banco de dados
│   ├── monitoring/               # Métricas e logs
│   ├── utils/                    # Funções auxiliares
│   └── api/                      # API REST
├── data/                         # Dados persistentes
│   ├── models/                   # Modelos ML treinados
│   ├── training/                 # Dataset de treinamento
│   └── backup/                   # Backups do banco
├── python-services/              # Microserviços Python
│   ├── easyocr-service/         # EasyOCR API
│   └── paddleocr-service/       # PaddleOCR API
├── tests/                        # Testes
│   ├── unit/                     # Testes unitários
│   ├── integration/              # Testes de integração
│   └── e2e/                      # Testes end-to-end
├── config/                       # Configurações
├── uploads/                      # Uploads temporários
└── logs/                         # Arquivos de log
```
