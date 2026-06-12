import QualityAnalyzer from '../src/preprocessing/qualityAnalyzer.js'
import QualityPolicy from '../src/preprocessing/qualityPolicy.js'
import fs from 'fs'
import path from 'path'

/**
 * Script de Calibração de Thresholds
 * 
 * OBJETIVO: Encontrar thresholds ótimos baseados em dados reais de OCR
 * 
 * PROCESSO:
 * 1. Coletar dataset de imagens com OCR ground truth
 * 2. Analisar cada imagem
 * 3. Correlacionar métricas com OCR confidence
 * 4. Encontrar thresholds que maximizam precisão
 * 5. Gerar constantes otimizadas
 * 
 * DATASET NECESSÁRIO:
 * 
 * dataset/
 * ├── images/
 * │   ├── sms_001.png
 * │   ├── sms_002.png
 * │   └── ...
 * └── ground_truth.json  ← OCR confidence de cada imagem
 * 
 * ground_truth.json format:
 * {
 *   "sms_001.png": {
 *     "ocrConfidence": 0.95,
 *     "textExtracted": "...",
 *     "hasSmallText": true
 *   },
 *   ...
 * }
 */

class ThresholdCalibrator {
  constructor(config = {}) {
    this.analyzer = new QualityAnalyzer()
    this.config = {
      targetOCRConfidence: config.targetOCRConfidence || 0.80,
      ...config
    }
    
    this.results = []
  }

  /**
   * Carrega dataset
   */
  loadDataset(datasetPath) {
    const imagesDir = path.join(datasetPath, 'images')
    const groundTruthPath = path.join(datasetPath, 'ground_truth.json')
    
    if (!fs.existsSync(imagesDir)) {
      throw new Error(`Diretório de imagens não encontrado: ${imagesDir}`)
    }
    
    if (!fs.existsSync(groundTruthPath)) {
      throw new Error(`Ground truth não encontrado: ${groundTruthPath}`)
    }
    
    const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'))
    const imageFiles = fs.readdirSync(imagesDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    
    const dataset = imageFiles.map(filename => {
      const imagePath = path.join(imagesDir, filename)
      const gt = groundTruth[filename]
      
      if (!gt) {
        console.warn(`⚠️  Ground truth não encontrado para: ${filename}`)
        return null
      }
      
      return {
        filename,
        imagePath,
        ocrConfidence: gt.ocrConfidence,
        textExtracted: gt.textExtracted,
        hasSmallText: gt.hasSmallText || false
      }
    }).filter(Boolean)
    
    console.log(`✓ Dataset carregado: ${dataset.length} imagens`)
    return dataset
  }

  /**
   * Analisa todo o dataset
   */
  async analyzeDataset(dataset) {
    console.log('\n📊 Analisando dataset...\n')
    
    const results = []
    
    for (let i = 0; i < dataset.length; i++) {
      const sample = dataset[i]
      
      process.stdout.write(`  [${i + 1}/${dataset.length}] ${sample.filename}...`)
      
      try {
        const analysis = await this.analyzer.analyze(sample.imagePath)
        
        results.push({
          filename: sample.filename,
          ocrConfidence: sample.ocrConfidence,
          hasSmallText: sample.hasSmallText,
          metrics: {
            textReadability: analysis.metrics.textReadability.score,
            sharpness: analysis.metrics.sharpness.score,
            contrast: analysis.metrics.contrast.score,
            brightness: analysis.metrics.brightness.score,
            resolution: analysis.metrics.resolution.score
          },
          rawMetrics: analysis.metrics
        })
        
        console.log(` ✓ (OCR: ${(sample.ocrConfidence * 100).toFixed(1)}%)`)
        
      } catch (error) {
        console.log(` ✗ Erro: ${error.message}`)
      }
    }
    
    this.results = results
    return results
  }

  /**
   * Calcula correlação entre métrica e OCR confidence
   */
  calculateCorrelation(metricName) {
    const n = this.results.length
    
    const x = this.results.map(r => r.metrics[metricName])
    const y = this.results.map(r => r.ocrConfidence)
    
    const meanX = x.reduce((sum, val) => sum + val, 0) / n
    const meanY = y.reduce((sum, val) => sum + val, 0) / n
    
    let numerator = 0
    let denominatorX = 0
    let denominatorY = 0
    
    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX
      const dy = y[i] - meanY
      
      numerator += dx * dy
      denominatorX += dx * dx
      denominatorY += dy * dy
    }
    
    const correlation = numerator / Math.sqrt(denominatorX * denominatorY)
    
    return {
      metric: metricName,
      correlation: parseFloat(correlation.toFixed(3)),
      meanMetric: parseFloat(meanX.toFixed(3)),
      meanOCR: parseFloat(meanY.toFixed(3))
    }
  }

  /**
   * Encontra threshold ótimo para uma métrica
   * 
   * Objetivo: maximizar precision (evitar falsos positivos)
   * enquanto mantém recall aceitável (detectar problemas reais)
   */
  findOptimalThreshold(metricName) {
    // Criar array de possíveis thresholds
    const thresholds = []
    for (let t = 0.3; t <= 0.9; t += 0.05) {
      thresholds.push(parseFloat(t.toFixed(2)))
    }
    
    const results = thresholds.map(threshold => {
      let truePositive = 0   // Métrica baixa E OCR ruim (correto)
      let falsePositive = 0  // Métrica baixa MAS OCR bom (falso alarme)
      let trueNegative = 0   // Métrica boa E OCR bom (correto)
      let falseNegative = 0  // Métrica boa MAS OCR ruim (perdemos problema)
      
      for (const sample of this.results) {
        const metricScore = sample.metrics[metricName]
        const ocrGood = sample.ocrConfidence >= this.config.targetOCRConfidence
        const metricGood = metricScore >= threshold
        
        if (!metricGood && !ocrGood) truePositive++
        if (!metricGood && ocrGood) falsePositive++
        if (metricGood && ocrGood) trueNegative++
        if (metricGood && !ocrGood) falseNegative++
      }
      
      const precision = truePositive / (truePositive + falsePositive) || 0
      const recall = truePositive / (truePositive + falseNegative) || 0
      const f1 = 2 * (precision * recall) / (precision + recall) || 0
      
      return {
        threshold,
        truePositive,
        falsePositive,
        trueNegative,
        falseNegative,
        precision: parseFloat(precision.toFixed(3)),
        recall: parseFloat(recall.toFixed(3)),
        f1: parseFloat(f1.toFixed(3))
      }
    })
    
    // Encontrar threshold com melhor F1 score
    const optimal = results.reduce((best, current) => {
      return current.f1 > best.f1 ? current : best
    })
    
    return {
      metric: metricName,
      optimalThreshold: optimal.threshold,
      performance: {
        precision: optimal.precision,
        recall: optimal.recall,
        f1: optimal.f1
      },
      confusionMatrix: {
        truePositive: optimal.truePositive,
        falsePositive: optimal.falsePositive,
        trueNegative: optimal.trueNegative,
        falseNegative: optimal.falseNegative
      },
      allResults: results
    }
  }

  /**
   * Gera relatório completo
   */
  generateReport() {
    console.log('\n' + '='.repeat(70))
    console.log('📊 RELATÓRIO DE CALIBRAÇÃO')
    console.log('='.repeat(70))
    
    console.log(`\nDataset: ${this.results.length} imagens`)
    console.log(`Target OCR Confidence: ${(this.config.targetOCRConfidence * 100).toFixed(1)}%`)
    
    // Estatísticas do dataset
    const avgOCR = this.results.reduce((sum, r) => sum + r.ocrConfidence, 0) / this.results.length
    const goodOCR = this.results.filter(r => r.ocrConfidence >= this.config.targetOCRConfidence).length
    
    console.log(`\n📈 Estatísticas:`)
    console.log(`  OCR médio: ${(avgOCR * 100).toFixed(1)}%`)
    console.log(`  OCR ≥ ${(this.config.targetOCRConfidence * 100).toFixed(1)}%: ${goodOCR}/${this.results.length} (${(goodOCR / this.results.length * 100).toFixed(1)}%)`)
    
    // Correlações
    console.log(`\n📊 Correlações com OCR Confidence:`)
    const metrics = ['textReadability', 'sharpness', 'contrast', 'brightness', 'resolution']
    
    const correlations = metrics.map(m => this.calculateCorrelation(m))
    correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    
    correlations.forEach(c => {
      console.log(`  ${c.metric.padEnd(20)}: ${c.correlation.toFixed(3)} (média: ${c.meanMetric.toFixed(3)})`)
    })
    
    // Thresholds ótimos
    console.log(`\n🎯 Thresholds Ótimos:`)
    
    const optimalThresholds = {}
    
    for (const metric of metrics) {
      const result = this.findOptimalThreshold(metric)
      optimalThresholds[metric] = result.optimalThreshold
      
      console.log(`\n  ${metric}:`)
      console.log(`    Threshold: ${result.optimalThreshold}`)
      console.log(`    Precision: ${(result.performance.precision * 100).toFixed(1)}%`)
      console.log(`    Recall: ${(result.performance.recall * 100).toFixed(1)}%`)
      console.log(`    F1 Score: ${(result.performance.f1 * 100).toFixed(1)}%`)
      console.log(`    Confusion Matrix:`)
      console.log(`      TP: ${result.confusionMatrix.truePositive}, FP: ${result.confusionMatrix.falsePositive}`)
      console.log(`      TN: ${result.confusionMatrix.trueNegative}, FN: ${result.confusionMatrix.falseNegative}`)
    }
    
    // Gerar código de constantes
    console.log(`\n\n💻 CONSTANTES OTIMIZADAS:`)
    console.log('='.repeat(70))
    console.log(`
// Adicionar ao constants.js
// Baseado em calibração com ${this.results.length} imagens
// Data: ${new Date().toISOString()}

export const DECISION_THRESHOLDS_CALIBRATED = {
  SMS: {
    overall: 0.70,  // Mantido (calculado via pesos)
    textReadability: ${optimalThresholds.textReadability},
    sharpness: ${optimalThresholds.sharpness},
    contrast: ${optimalThresholds.contrast},
    brightness: ${optimalThresholds.brightness}
  }
}
`)
    
    console.log('='.repeat(70))
    
    return {
      dataset: {
        size: this.results.length,
        avgOCR,
        goodOCR
      },
      correlations,
      optimalThresholds
    }
  }

  /**
   * Salva relatório em arquivo
   */
  saveReport(outputPath) {
    const report = {
      generatedAt: new Date().toISOString(),
      config: this.config,
      dataset: {
        size: this.results.length,
        avgOCR: this.results.reduce((sum, r) => sum + r.ocrConfidence, 0) / this.results.length
      },
      correlations: ['textReadability', 'sharpness', 'contrast', 'brightness', 'resolution']
        .map(m => this.calculateCorrelation(m)),
      optimalThresholds: {},
      details: this.results
    }
    
    const metrics = ['textReadability', 'sharpness', 'contrast', 'brightness', 'resolution']
    for (const metric of metrics) {
      report.optimalThresholds[metric] = this.findOptimalThreshold(metric)
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
    console.log(`\n💾 Relatório salvo: ${outputPath}`)
  }
}

// ============================================================
// Uso
// ============================================================

async function main() {
  const datasetPath = process.argv[2]
  
  if (!datasetPath) {
    console.log(`
❌ Uso: node calibrate.js <dataset-path>

📁 Estrutura esperada do dataset:

  dataset/
  ├── images/
  │   ├── sms_001.png
  │   ├── sms_002.png
  │   └── ...
  └── ground_truth.json

📝 Formato do ground_truth.json:

  {
    "sms_001.png": {
      "ocrConfidence": 0.95,
      "textExtracted": "09:47\\nJoão Silva\\nMensagem...",
      "hasSmallText": true
    },
    ...
  }

💡 Como gerar ground_truth.json:
  1. Rodar OCR em todas as imagens do dataset
  2. Coletar confidence score de cada uma
  3. Salvar em JSON no formato acima

🎯 Objetivo:
  Encontrar thresholds ótimos que correlacionam
  métricas de qualidade com OCR confidence.
`)
    process.exit(1)
  }
  
  const calibrator = new ThresholdCalibrator({
    targetOCRConfidence: 0.80
  })
  
  try {
    // Carregar dataset
    const dataset = calibrator.loadDataset(datasetPath)
    
    // Analisar
    await calibrator.analyzeDataset(dataset)
    
    // Gerar relatório
    const report = calibrator.generateReport()
    
    // Salvar
    calibrator.saveReport(path.join(datasetPath, 'calibration_report.json'))
    
    console.log('\n✅ Calibração concluída!')
    
  } catch (error) {
    console.error('\n❌ Erro:', error.message)
    process.exit(1)
  }
}

main()