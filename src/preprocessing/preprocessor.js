import QualityAnalyzer from './qualityAnalyzer.js'
import RotationDetector from './rotationDetector.js'
import ImageEnhancer from './imageEnhancer.js'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

const DEFAULT_CONFIG = {
  // Preprocessor geral
  enableLogs: true,
  enableQualityAnalysis: true,
  enableRotationDetection: true,
  enableEnhancement: true,
  returnOriginalBuffer: false,
  
  // Módulos específicos
  quality: {
    enableLogs: false
  },
  rotation: {
    osdStrategy: 'never',
    enableLogs: false
  },
  enhancement: {
    enableLogs: false
  }
}

/**
 * Preprocessor com Pipeline Único do Sharp
 */
class Preprocessor {
  constructor(config = {}, ocrEngine = null) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.log = this.config.enableLogs ? console.log : () => {}
    
    // Inicializar módulos
    this.qualityAnalyzer = new QualityAnalyzer(this.config.quality)
    this.rotationDetector = new RotationDetector(this.config.rotation, ocrEngine)
    this.imageEnhancer = new ImageEnhancer(this.config.enhancement)
  }

  /**
   * Pipeline único de preprocessamento
   * 
   * FLUXO:
   * 1. Carregar buffer original
   * 2. Análise de qualidade (read-only)
   * 3. Detecção de rotação (read-only)
   * 4. Criar pipeline Sharp
   * 5. Adicionar rotação ao pipeline
   * 6. Adicionar melhorias ao pipeline
   * 7. Executar tudo de uma vez (toBuffer)
   */
  async process(imagePath) {
    const startTime = Date.now()
    const results = {}
    
    try {
      this.log('\n' + '='.repeat(60))
      this.log('🎨 PREPROCESSAMENTO - PIPELINE ÚNICO')
      this.log('='.repeat(60))
      this.log(`📁 Arquivo: ${path.basename(imagePath)}`)

      // Validação
      this.validateFile(imagePath)

      // Carregar buffer original
      let imageBuffer = fs.readFileSync(imagePath)
      const originalSize = imageBuffer.length

      // ETAPA 1: Análise de Qualidade (opcional, read-only)
      if (this.config.enableQualityAnalysis) {
        this.log('\n📊 ETAPA 1/3: Análise de Qualidade')
        this.log('-'.repeat(60))
        
        results.quality = await this.qualityAnalyzer.analyze(imageBuffer)
        this.printQualityReport(results.quality)
      }

      // ETAPA 2: Detecção de Rotação (opcional, read-only)
      if (this.config.enableRotationDetection) {
        this.log('\n🔄 ETAPA 2/3: Detecção de Rotação')
        this.log('-'.repeat(60))
        
        results.rotation = await this.rotationDetector.detect(imageBuffer)
        this.printRotationReport(results.rotation)
      }

      // ETAPA 3: Pipeline Único do Sharp
      this.log('\n⚡ ETAPA 3/3: Pipeline Único do Sharp')
      this.log('-'.repeat(60))

      // Criar pipeline inicial
      let pipeline = sharp(imageBuffer)

      // Adicionar rotação ao pipeline (se necessário)
      if (results.rotation?.needsRotation) {
        this.log(`  🔄 Adicionando rotação de ${results.rotation.angle}° ao pipeline...`)
        // pipeline = pipeline.rotate(results.rotation.angle)
        pipeline = pipeline.rotate(results.rotation.angle)
      }

      // Adicionar melhorias ao pipeline (se habilitado)
      if (this.config.enableEnhancement) {
        const needsEnhancement = results.quality?.needsPreprocessing ?? true
        
        if (needsEnhancement) {
          this.log('  ✨ Adicionando melhorias ao pipeline...')
          pipeline = this.imageEnhancer.enhance(pipeline, results.quality)
        } else {
          this.log('  🔧 Adicionando preprocessamento básico...')
          pipeline = this.imageEnhancer.preprocessForOCR(pipeline)
        }
      } else {
        // Mínimo: greyscale para OCR
        this.log('  ⚙️  Convertendo para greyscale...')
        pipeline = pipeline.greyscale()
      }

      // Executar pipeline de uma vez
      this.log('  ⚡ Executando pipeline (decode → transform → encode)...')
      const processedBuffer = await pipeline.toBuffer()
      const processedSize = processedBuffer.length

      // Metadata final
      const finalMetadata = await sharp(processedBuffer).metadata()

      // Resumo
      const totalTime = Date.now() - startTime
      
      this.log('\n' + '='.repeat(60))
      this.log('✅ PREPROCESSAMENTO CONCLUÍDO')
      this.log('='.repeat(60))
      this.log(`⏱️  Tempo total: ${totalTime}ms`)
      
      if (results.quality) {
        this.log(`📊 Score: ${(results.quality.score * 100).toFixed(1)}% (${results.quality.grade})`)
      }
      
      if (results.rotation?.needsRotation) {
        this.log(`🔄 Rotação aplicada: ${results.rotation.angle}°`)
      }
      
      this.log(`📐 Dimensões: ${finalMetadata.width}x${finalMetadata.height}`)
      this.log(`📦 Tamanho: ${(originalSize / 1024).toFixed(2)} KB → ${(processedSize / 1024).toFixed(2)} KB`)
      this.log(`🎨 Canais: ${finalMetadata.channels} (${finalMetadata.space})`)
      this.log('='.repeat(60) + '\n')

      return {
        success: true,
        processed: {
          buffer: processedBuffer,
          size: processedSize,
          metadata: finalMetadata
        },
        ...(this.config.returnOriginalBuffer && {
          original: {
            path: imagePath,
            size: originalSize,
            buffer: imageBuffer
          }
        }),
        ...results,
        processingTime: totalTime
      }

    } catch (error) {
      console.error('\n❌ Erro no preprocessamento:', error.message)
      await this.cleanup().catch(() => {})
      throw error
    }
  }

  /**
   * Valida arquivo
   */
  validateFile(imagePath) {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Arquivo não encontrado: ${imagePath}`)
    }

    const ext = path.extname(imagePath).toLowerCase()
    const validExts = ['.png', '.jpg', '.jpeg', '.webp']
    
    if (!validExts.includes(ext)) {
      throw new Error(`Formato inválido: ${ext}. Aceitos: ${validExts.join(', ')}`)
    }

    const stats = fs.statSync(imagePath)
    const maxSize = 10 * 1024 * 1024 // 10MB
    
    if (stats.size > maxSize) {
      throw new Error(`Arquivo muito grande: ${(stats.size / 1024 / 1024).toFixed(2)}MB (máx: 10MB)`)
    }

    this.log(`  ✓ Arquivo válido: ${(stats.size / 1024).toFixed(2)} KB`)
  }

  /**
   * Relatórios formatados
   */
  printQualityReport(quality) {
    this.log(`  📊 Score: ${(quality.score * 100).toFixed(1)}% (${quality.grade})`)
    this.log(`  📏 Resolução: ${quality.analysis.resolution.dimensions} - ${quality.analysis.resolution.status}`)
    this.log(`  💡 Brilho: ${quality.analysis.brightness.percentage} - ${quality.analysis.brightness.status}`)
    this.log(`  📊 Contraste: ${quality.analysis.contrast.stdDev} - ${quality.analysis.contrast.status}`)
    this.log(`  🔪 Nitidez: ${quality.analysis.sharpness.variance} - ${quality.analysis.sharpness.status}`)

    if (quality.suggestions.length > 0) {
      this.log(`  💡 Sugestões:`)
      quality.suggestions.forEach(s => {
        this.log(`     [${s.priority.toUpperCase()}] ${s.action}`)
      })
    }

    this.log(`  ${quality.needsPreprocessing ? '⚠️' : '✅'} Preprocessamento: ${quality.needsPreprocessing ? 'NECESSÁRIO' : 'OPCIONAL'}`)
  }

  printRotationReport(rotation) {
    this.log(`  🔄 Método: ${rotation.method}`)
    this.log(`  📐 Ângulo: ${rotation.angle}°`)
    this.log(`  🎯 Confiança: ${(rotation.confidence * 100).toFixed(1)}%`)
    this.log(`  ${rotation.needsRotation ? '🔄' : '✅'} Rotação: ${rotation.needsRotation ? 'NECESSÁRIA' : 'NÃO NECESSÁRIA'}`)
  }

  /**
   * Salva imagem preservando formato
   */
  async saveProcessed(processedBuffer, originalPath, options = {}) {
    try {
      const outputDir = options.outputDir || './uploads/processed'
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const ext = path.extname(originalPath).toLowerCase()
      const format = options.format || ext.replace('.', '')
      const baseName = path.basename(originalPath, ext)
      const outputPath = path.join(outputDir, `${baseName}_processed.${format}`)

      let pipeline = sharp(processedBuffer)

      // Preservar/converter formato
      switch (format) {
        case 'jpeg':
        case 'jpg':
          pipeline = pipeline.jpeg({ quality: options.quality || 90 })
          break
        case 'png':
          pipeline = pipeline.png({ compressionLevel: options.compressionLevel || 6 })
          break
        case 'webp':
          pipeline = pipeline.webp({ quality: options.quality || 90 })
          break
        default:
          pipeline = pipeline.png()
      }

      await pipeline.toFile(outputPath)

      this.log(`💾 Imagem salva: ${outputPath}`)
      return outputPath

    } catch (error) {
      console.error('❌ Erro ao salvar:', error.message)
      throw error
    }
  }

  /**
   * Cleanup de recursos
   */
  async cleanup() {
    if (this.rotationDetector) {
      await this.rotationDetector.cleanup()
    }
  }
}

export default Preprocessor