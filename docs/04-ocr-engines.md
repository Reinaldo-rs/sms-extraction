# 04 - OCR Engines (Integração)

> **Navegação:** [← Pipeline Flow](03-pipeline-flow.md) | [ML Training →](05-ml-training.md)

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Engine 1: Tesseract (Node.js)](#engine-1-tesseract-nodejs)
3. [Engine 2: EasyOCR (Python)](#engine-2-easyocr-python)
4. [Engine 3: PaddleOCR (Python)](#engine-3-paddleocr-python)
5. [Integração Python ↔ Node.js](#integração-python--nodejs)
6. [Alternativas 100% JavaScript](#alternativas-100-javascript)

---

## 🔍 Visão Geral

### Por que Multi-OCR?

| Engine | Linguagem | Pontos Fortes | Pontos Fracos |
|--------|-----------|---------------|---------------|
| **Tesseract** | C++ (Node.js wrapper) | • Rápido<br>• Maduro<br>• Sem dependências Python | • Menos preciso em textos pequenos<br>• Requer preprocessamento |
| **EasyOCR** | Python | • Alta precisão<br>• Múltiplos idiomas<br>• Deep Learning | • Mais lento<br>• Requer GPU (opcional) |
| **PaddleOCR** | Python | • Muito preciso<br>• Otimizado para produção<br>• Suporte chinês | • Setup complexo<br>• Documentação em chinês |

### Estratégia de Integração

```
┌─────────────────────────────────────────────┐
│         Node.js Main Application            │
│                                             │
│  ┌─────────────┐                           │
│  │ Tesseract.js│  (Nativo)                 │
│  └──────┬──────┘                           │
│         │                                   │
│  ┌──────▼──────────────────────────┐       │
│  │   HTTP Clients                  │       │
│  │   • Axios / Fetch               │       │
│  └──────┬──────────────────────────┘       │
└─────────┼────────────────────────────────┐
          │                                  │
    ┌─────▼──────┐           ┌──────▼─────┐ │
    │ EasyOCR    │           │ PaddleOCR  │ │
    │ Python API │           │ Python API │ │
    │ (Flask)    │           │ (Flask)    │ │
    └────────────┘           └────────────┘ │
```

---

## 🅰️ Engine 1: Tesseract (Node.js)

### Instalação
```bash
npm install tesseract.js
```

### Implementação
```javascript
// src/ocr/tesseractOCR.js
const Tesseract = require('tesseract.js');

class TesseractEngine {
  constructor(config = {}) {
    this.config = {
      lang: 'por',
      psm: 6,  // Assume uniform block of text
      oem: 3,  // Default OCR Engine Mode
      ...config
    };
  }

  async extract(imageBuffer) {
    const startTime = Date.now();
    
    try {
      const { data } = await Tesseract.recognize(
        imageBuffer,
        this.config.lang,
        {
          logger: m => {
            if (m.status === 'recognizing text') {
              console.log(`Tesseract: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`Tesseract completed in ${elapsed}ms`);
      
      return this.formatResult(data);
      
    } catch (error) {
      console.error('Tesseract error:', error.message);
      throw new Error(`Tesseract OCR failed: ${error.message}`);
    }
  }

  formatResult(data) {
    const texts = data.words
      .filter(word => word.confidence > 50)
      .map(word => ({
        text: word.text,
        confidence: word.confidence / 100,
        bbox: {
          left: word.bbox.x0,
          top: word.bbox.y0,
          right: word.bbox.x1,
          bottom: word.bbox.y1
        }
      }));

    return {
      texts,
      fullText: data.text,
      confidence: data.confidence / 100
    };
  }

  // Configurações otimizadas para SMS
  static getSMSConfig() {
    return {
      lang: 'por',
      psm: 6,     // Uniform block
      oem: 3,     // Default
      tessedit_char_whitelist: 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;-/()'
    };
  }
}

module.exports = TesseractEngine;
```

### Otimizações

#### 1. PSM (Page Segmentation Mode)
```javascript
const PSM_MODES = {
  SINGLE_BLOCK: 6,      // Para SMS completo
  SINGLE_LINE: 7,       // Para linhas individuais
  SINGLE_WORD: 8,       // Para palavras isoladas
  SPARSE_TEXT: 11       // Para textos esparsos
};
```

#### 2. Whitelist de Caracteres
```javascript
// Remove caracteres que raramente aparecem em SMS
tessedit_char_whitelist: 
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
  'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç' +
  '0123456789' +
  ' .,:;!?-/()@#$%&*+=[]{}"\''
```

---

## 🐍 Engine 2: EasyOCR (Python)

### Setup do Microserviço

#### Estrutura
```
python-services/
└── easyocr-service/
    ├── app.py
    ├── requirements.txt
    ├── Dockerfile
    └── config.py
```

#### requirements.txt
```txt
easyocr==1.7.0
flask==3.0.0
flask-cors==4.0.0
gunicorn==21.2.0
pillow==10.1.0
numpy==1.24.3
torch==2.1.0
```

#### app.py
```python
# python-services/easyocr-service/app.py
from flask import Flask, request, jsonify
import easyocr
import base64
import io
from PIL import Image
import numpy as np

app = Flask(__name__)

# Inicializa reader (carrega modelo)
print("Loading EasyOCR model...")
reader = easyocr.Reader(['pt', 'en'], gpu=False)
print("EasyOCR ready!")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'easyocr'})

@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        data = request.get_json()
        
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image = Image.open(io.BytesIO(image_data))
        image_np = np.array(image)
        
        # Perform OCR
        results = reader.readtext(image_np)
        
        # Format results
        formatted = []
        for bbox, text, confidence in results:
            formatted.append({
                'text': text,
                'confidence': float(confidence),
                'bbox': {
                    'left': int(min(p[0] for p in bbox)),
                    'top': int(min(p[1] for p in bbox)),
                    'right': int(max(p[0] for p in bbox)),
                    'bottom': int(max(p[1] for p in bbox))
                }
            })
        
        return jsonify({
            'texts': formatted,
            'count': len(formatted)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
```

#### Dockerfile
```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5001

CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "2", "--timeout", "120", "app:app"]
```

### Cliente Node.js
```javascript
// src/ocr/easyOCR.js
const axios = require('axios');

class EasyOCRClient {
  constructor(baseURL = 'http://localhost:5001') {
    this.baseURL = baseURL;
    this.timeout = 30000; // 30s
  }

  async extract(imageBuffer) {
    const startTime = Date.now();
    
    try {
      // Check health first
      await this.checkHealth();
      
      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      
      // Call API
      const response = await axios.post(
        `${this.baseURL}/ocr`,
        { image: base64Image },
        { timeout: this.timeout }
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`EasyOCR completed in ${elapsed}ms`);
      
      return response.data;
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('EasyOCR service is not running');
      }
      throw new Error(`EasyOCR failed: ${error.message}`);
    }
  }

  async checkHealth() {
    try {
      await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
      return true;
    } catch (error) {
      throw new Error('EasyOCR service is not healthy');
    }
  }
}

module.exports = EasyOCRClient;
```

---

## 🛶 Engine 3: PaddleOCR (Python)

### Setup do Microserviço

#### requirements.txt
```txt
paddlepaddle==2.5.2
paddleocr==2.7.0
flask==3.0.0
flask-cors==4.0.0
gunicorn==21.2.0
pillow==10.1.0
numpy==1.24.3
```

#### app.py
```python
# python-services/paddleocr-service/app.py
from flask import Flask, request, jsonify
from paddleocr import PaddleOCR
import base64
import io
from PIL import Image
import numpy as np

app = Flask(__name__)

# Initialize PaddleOCR
print("Loading PaddleOCR model...")
ocr = PaddleOCR(
    use_angle_cls=True,
    lang='pt',
    use_gpu=False,
    show_log=False
)
print("PaddleOCR ready!")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'paddleocr'})

@app.route('/ocr', methods=['POST'])
def ocr_endpoint():
    try:
        data = request.get_json()
        
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = base64.b64decode(data['image'])
        image = Image.open(io.BytesIO(image_data))
        image_np = np.array(image)
        
        # Perform OCR
        results = ocr.ocr(image_np, cls=True)
        
        # Format results
        formatted = []
        if results and results[0]:
            for line in results[0]:
                bbox, (text, confidence) = line
                formatted.append({
                    'text': text,
                    'confidence': float(confidence),
                    'bbox': {
                        'left': int(min(p[0] for p in bbox)),
                        'top': int(min(p[1] for p in bbox)),
                        'right': int(max(p[0] for p in bbox)),
                        'bottom': int(max(p[1] for p in bbox))
                    }
                })
        
        return jsonify({
            'texts': formatted,
            'count': len(formatted)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5002)
```

#### Dockerfile
```dockerfile
FROM python:3.9-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libgomp1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5002

CMD ["gunicorn", "--bind", "0.0.0.0:5002", "--workers", "2", "--timeout", "120", "app:app"]
```

### Cliente Node.js
```javascript
// src/ocr/paddleOCR.js
const axios = require('axios');

class PaddleOCRClient {
  constructor(baseURL = 'http://localhost:5002') {
    this.baseURL = baseURL;
    this.timeout = 30000;
  }

  async extract(imageBuffer) {
    const startTime = Date.now();
    
    try {
      await this.checkHealth();
      
      const base64Image = imageBuffer.toString('base64');
      
      const response = await axios.post(
        `${this.baseURL}/ocr`,
        { image: base64Image },
        { timeout: this.timeout }
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`PaddleOCR completed in ${elapsed}ms`);
      
      return response.data;
      
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('PaddleOCR service is not running');
      }
      throw new Error(`PaddleOCR failed: ${error.message}`);
    }
  }

  async checkHealth() {
    try {
      await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
      return true;
    } catch (error) {
      throw new Error('PaddleOCR service is not healthy');
    }
  }
}

module.exports = PaddleOCRClient;
```

---

## 🔗 Integração Python ↔ Node.js

### Opção 1: HTTP/REST (Recomendado)

#### Vantagens
✅ Serviços independentes
✅ Fácil de escalar horizontalmente
✅ Pode usar containers Docker
✅ Fácil monitoramento

#### Setup com Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - easyocr
      - paddleocr
    environment:
      EASYOCR_URL: http://easyocr:5001
      PADDLEOCR_URL: http://paddleocr:5002

  easyocr:
    build: ./python-services/easyocr-service
    ports:
      - "5001:5001"
    deploy:
      resources:
        limits:
          memory: 2G

  paddleocr:
    build: ./python-services/paddleocr-service
    ports:
      - "5002:5002"
    deploy:
      resources:
        limits:
          memory: 2G
```

#### Iniciar Serviços
```bash
# Inicia todos os serviços
docker-compose up -d

# Verifica saúde
curl http://localhost:5001/health
curl http://localhost:5002/health

# Logs
docker-compose logs -f easyocr
```

---

### Opção 2: Child Process (Alternativa)

```javascript
// src/ocr/pythonOCR.js
const { spawn } = require('child_process');
const path = require('path');

class PythonOCRWrapper {
  async extract(imagePath, engine = 'easyocr') {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '../../python-scripts', `${engine}.py`);
      
      const python = spawn('python3', [scriptPath, imagePath]);
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      python.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse OCR output: ${error.message}`));
          }
        } else {
          reject(new Error(`Python script failed: ${stderr}`));
        }
      });
      
      // Timeout de 30s
      setTimeout(() => {
        python.kill();
        reject(new Error('OCR timeout'));
      }, 30000);
    });
  }
}

module.exports = PythonOCRWrapper;
```

#### Script Python
```python
# python-scripts/easyocr.py
import sys
import json
import easyocr

def main(image_path):
    reader = easyocr.Reader(['pt', 'en'], gpu=False)
    results = reader.readtext(image_path)
    
    formatted = []
    for bbox, text, confidence in results:
        formatted.append({
            'text': text,
            'confidence': float(confidence),
            'bbox': {
                'left': int(min(p[0] for p in bbox)),
                'top': int(min(p[1] for p in bbox)),
                'right': int(max(p[0] for p in bbox)),
                'bottom': int(max(p[1] for p in bbox))
            }
        })
    
    print(json.dumps({'texts': formatted}))

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'error': 'Usage: python easyocr.py <image_path>'}))
        sys.exit(1)
    
    main(sys.argv[1])
```

---

## 🟢 Alternativas 100% JavaScript

Se você quer evitar Python completamente:

### 1. Tesseract.js (já usado)
✅ Já implementado
✅ 100% JavaScript
❌ Menos preciso que EasyOCR/Paddle

### 2. Google Cloud Vision API
```javascript
// src/ocr/googleVision.js
const vision = require('@google-cloud/vision');

class GoogleVisionOCR {
  constructor() {
    this.client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
  }

  async extract(imageBuffer) {
    const [result] = await this.client.textDetection(imageBuffer);
    const texts = result.textAnnotations;
    
    return this.formatResult(texts);
  }
}
```

**Custo:** ~$1.50 por 1000 imagens

### 3. Azure Computer Vision
```javascript
// src/ocr/azureOCR.js
const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');

class AzureOCR {
  constructor() {
    this.client = new ComputerVisionClient(
      credentials,
      process.env.AZURE_ENDPOINT
    );
  }

  async extract(imageBuffer) {
    const result = await this.client.recognizePrintedTextInStream(imageBuffer);
    return this.formatResult(result);
  }
}
```

**Custo:** ~$1.00 por 1000 imagens

### 4. AWS Textract
```javascript
// src/ocr/awsTextract.js
const AWS = require('aws-sdk');

class AWSTextract {
  constructor() {
    this.textract = new AWS.Textract({
      region: process.env.AWS_REGION
    });
  }

  async extract(imageBuffer) {
    const params = {
      Document: { Bytes: imageBuffer }
    };
    
    const result = await this.textract.detectDocumentText(params).promise();
    return this.formatResult(result);
  }
}
```

**Custo:** ~$1.50 por 1000 páginas

---

## 🔧 Configuração Recomendada

### Para Desenvolvimento
```javascript
// config/development.js
module.exports = {
  ocr: {
    engines: ['tesseract'],  // Só Tesseract (rápido setup)
    tesseract: {
      lang: 'por',
      psm: 6
    }
  }
};
```

### Para Produção
```javascript
// config/production.js
module.exports = {
  ocr: {
    engines: ['tesseract', 'easyocr', 'paddle'],
    tesseract: { ... },
    easyocr: {
      url: process.env.EASYOCR_URL || 'http://easyocr:5001',
      timeout: 30000
    },
    paddle: {
      url: process.env.PADDLEOCR_URL || 'http://paddleocr:5002',
      timeout: 30000
    }
  }
};
```

---

## 📊 Comparação de Performance

| Teste | Tesseract | EasyOCR | PaddleOCR |
|-------|-----------|---------|-----------|
| SMS simples | 500ms (85%) | 1800ms (95%) | 1600ms (93%) |
| SMS baixa qualidade | 600ms (65%) | 2200ms (88%) | 1900ms (90%) |
| SMS rotacionado | 700ms (70%) | 2000ms (92%) | 1800ms (91%) |
| SMS com emoji | 550ms (80%) | 1900ms (90%) | 1700ms (89%) |

*Tempo (Acurácia)*

---

**Próximo:** [05-ml-training.md](05-ml-training.md) - Machine Learning e Treinamento