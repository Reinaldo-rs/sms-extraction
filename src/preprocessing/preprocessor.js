import QualityAnalyzer from './qualityAnalyzer.js'
import RotationDetector from './rotationDetector.js'
import ImageEnhancer from './imageEnhancer.js'
import sharp from 'sharp'
import fs from 'fs'
import path from 'path'

/**
 * Orquestrador completo de preprocessamento
 */
class Preprocessor {
  constructor() {
    this.qualityAnalyzer = new QualityAnalyzer()
    this.rotationDetector = new RotationDetector()
    this.imageEnhancer = new ImageEnhancer()
  }

  /**
   * Pipeline completo de preprocessamento
   * @param {string} imagePath - Caminho da imagem
   * @returns {Object} - Imagem processada + metadados
   */
  async process(imagePath) {
    const startTime = Date.now()
    
    try {
      console.log('\n' + '='.repeat(60))
      console.log('🎨 INICIANDO PREPROCESSAMENTO')
      console.log('='.repeat(60))
      console.log(`📁 Arquivo: ${path.basename(imagePath)}`)

      // Validar arquivo
      this.validateFile(imagePath)

      // Carregar imagem original
      let imageBuffer = fs.readFileSync(imagePath)
      const originalSize = imageBuffer.length

      // ETAPA 1: Análise de Qualidade
      console.log('\n📊 ETAPA 1/4: Análise de Qualidade')
      console.log('-'.repeat(60))
      const quality = await this.qualityAnalyzer.analyze(imageBuffer)
      
      this.printQualityReport(quality)

      // ETAPA 2: Detecção de Rotação
      console.log('\n🔄 ETAPA 2/4: Detecção de Rotação')
      console.log('-'.repeat(60))
      const rotation = await this.rotationDetector.detect(imageBuffer)
      
      this.printRotationReport(rotation)

      // Aplicar rotação se necessário
      if (rotation.needsRotation) {
        imageBuffer = await this.rotationDetector.rotate(imageBuffer, rotation.angle)
      }

      // ETAPA 3: Melhorias na Imagem
      console.log('\n✨ ETAPA 3/4: Aplicando Melhorias')
      console.log('-'.repeat(60))
      
      let enhancedBuffer
      if (quality.needsPreprocessing) {
        enhancedBuffer = await this.imageEnhancer.enhance(imageBuffer, quality)
      } else {
        console.log('  ℹ️  Imagem já tem boa qualidade, aplicando preprocessamento básico...')
        enhancedBuffer = await this.imageEnhancer.preprocessForOCR(imageBuffer)
      }

      const enhancedSize = enhancedBuffer.length

      // ETAPA 4: Validação Final
      console.log('\n✅ ETAPA 4/4: Validação Final')
      console.log('-'.repeat(60))
      const finalMetadata = await sharp(enhancedBuffer).metadata()
      
      console.log(`  📐 Dimensões finais: ${finalMetadata.width}x${finalMetadata.height}`)
      console.log(`  📦 Tamanho: ${(originalSize / 1024).toFixed(2)} KB → ${(enhancedSize / 1024).toFixed(2)} KB`)
      console.log(`  🎨 Formato: ${finalMetadata.format}`)
      console.log(`  📊 Canais: ${finalMetadata.channels}`)

      const totalTime = Date.now() - startTime

      // Resumo
      console.log('\n' + '='.repeat(60))
      console.log('✅ PREPROCESSAMENTO CONCLUÍDO')
      console.log('='.repeat(60))
      console.log(`⏱️  Tempo total: ${totalTime}ms`)
      console.log(`📊 Score de qualidade: ${(quality.score * 100).toFixed(1)}% (${quality.grade})`)
      console.log('='.repeat(60) + '\n')

      return {
        success: true,
        original: {
          path: imagePath,
          size: originalSize,
          buffer: imageBuffer
        },
        processed: {
          buffer: enhancedBuffer,
          size: enhancedSize,
          metadata: finalMetadata
        },
        quality,
        rotation,
        processingTime: totalTime
      }

    } catch (error) {
      console.error('\n❌ Erro no preprocessamento:', error.message)
      throw error
    }
  }

  /**
   * Valida se arquivo existe e é imagem válida
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

    console.log(`  ✓ Arquivo válido: ${(stats.size / 1024).toFixed(2)} KB`)
  }

  /**
   * Imprime relatório de qualidade formatado
   */
  printQualityReport(quality) {
    console.log(`  📊 Score Geral: ${(quality.score * 100).toFixed(1)}% (Grade: ${quality.grade})`)
    console.log(`  📏 Resolução: ${quality.analysis.resolution.dimensions} (${quality.analysis.resolution.megapixels}MP) - ${quality.analysis.resolution.status}`)
    console.log(`  💡 Brilho: ${quality.analysis.brightness.percentage} - ${quality.analysis.brightness.status}`)
    console.log(`  📊 Contraste: ${quality.analysis.contrast.stdDev} - ${quality.analysis.contrast.status}`)
    console.log(`  🔪 Nitidez: ${quality.analysis.sharpness.variance} - ${quality.analysis.sharpness.status}`)

    if (quality.suggestions.length > 0) {
      console.log(`  💡 Sugestões:`)
      quality.suggestions.forEach(s => {
        console.log(`     [${s.priority.toUpperCase()}] ${s.action}`)
      })
    }

    console.log(`  ${quality.needsPreprocessing ? '⚠️' : '✅'} Necessita preprocessamento: ${quality.needsPreprocessing ? 'SIM' : 'NÃO'}`)
  }

  /**
   * Imprime relatório de rotação formatado
   */
  printRotationReport(rotation) {
    console.log(`  🔄 Método: ${rotation.method}`)
    console.log(`  📐 Ângulo detectado: ${rotation.angle}°`)
    console.log(`  🎯 Confiança: ${(rotation.confidence * 100).toFixed(1)}%`)
    console.log(`  ${rotation.needsRotation ? '🔄' : '✅'} Necessita rotação: ${rotation.needsRotation ? 'SIM' : 'NÃO'}`)
  }

  /**
   * Salva imagem processada
   */
  async saveProcessed(processedBuffer, originalPath, outputDir = './uploads/processed') {
    try {
      // Criar diretório se não existir
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      const baseName = path.basename(originalPath, path.extname(originalPath))
      const outputPath = path.join(outputDir, `${baseName}_processed.png`)

      await sharp(processedBuffer)
        .png()
        .toFile(outputPath)

      console.log(`💾 Imagem salva: ${outputPath}`)
      return outputPath

    } catch (error) {
      console.error('❌ Erro ao salvar imagem:', error.message)
      throw error
    }
  }
}

export default Preprocessor