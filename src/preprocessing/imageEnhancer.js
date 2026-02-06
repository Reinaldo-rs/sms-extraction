import sharp from 'sharp'

/**
 * ImageEnhancer - Retorna Sharp Pipeline
 * 
 * IMPORTANTE: Métodos agora retornam Sharp pipeline (não buffer)
 * para permitir encadeamento sem re-encodificação.
 */
class ImageEnhancer {
  constructor(config = {}) {
    this.config = {
      enableLogs: config.enableLogs ?? true,
      targetHeight: config.targetHeight ?? 1920,
      ...config
    }
    
    this.log = this.config.enableLogs ? console.log : () => {}
  }

  /**
   * Adiciona melhorias ao pipeline Sharp
   * 
   * @param {Sharp} pipeline - Pipeline Sharp existente
   * @param {Object} qualityAnalysis - Resultado do QualityAnalyzer
   * @returns {Sharp} - Pipeline com melhorias adicionadas
   */
  enhance(pipeline, qualityAnalysis = null) {
    this.log('✨ Adicionando melhorias ao pipeline...')

    // 1. Redimensionar (se necessário)
    if (qualityAnalysis?.metadata) {
      pipeline = this.addResize(pipeline, qualityAnalysis.metadata, qualityAnalysis)
    }

    // 2. Ajustar brilho
    if (qualityAnalysis?.analysis?.brightness) {
      pipeline = this.addBrightnessAdjustment(pipeline, qualityAnalysis.analysis.brightness)
    }

    // 3. Normalizar contraste
    if (qualityAnalysis?.analysis?.contrast?.score < 0.7) {
      this.log('  📊 Normalizando contraste...')
      pipeline = pipeline.normalize()
    }

    // 4. Aplicar sharpening
    if (qualityAnalysis?.analysis?.sharpness) {
      pipeline = this.addSharpen(pipeline, qualityAnalysis.analysis.sharpness)
    }

    // 5. Reduzir ruído (se muito nítida)
    if (qualityAnalysis?.analysis?.sharpness?.status === 'sharp') {
      this.log('  🔇 Reduzindo ruído...')
      pipeline = pipeline.median(3)
    }

    // 6. Preparar para OCR
    pipeline = pipeline
      .toColorspace('srgb')
      .removeAlpha()
      .greyscale()

    this.log('✅ Melhorias adicionadas ao pipeline')

    return pipeline
  }

  /**
   * Pipeline básico de preprocessamento
   * 
   * @param {Sharp} pipeline - Pipeline Sharp existente
   * @returns {Sharp} - Pipeline com preprocessamento básico
   */
  preprocessForOCR(pipeline) {
    this.log('🔧 Preprocessamento básico para OCR...')

    return pipeline
      .resize(null, this.config.targetHeight, { 
        fit: 'inside', 
        kernel: sharp.kernel.lanczos3 
      })
      .normalize()
      .sharpen({ sigma: 1.5, m1: 0.7, m2: 0.7 })
      .median(3)
      .greyscale()
  }

  /**
   * Adiciona redimensionamento ao pipeline
   */
  addResize(pipeline, metadata, qualityAnalysis) {
    const { width, height } = metadata
    const megapixels = (width * height) / 1000000

    // Muito grande (> 8MP) = reduzir
    if (megapixels > 8) {
      this.log(`  🔍 Redimensionando de ${width}x${height} (muito grande)...`)
      return pipeline.resize(null, 1920, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    // Muito pequeno (< 1000px altura) = aumentar
    if (height < 1000) {
      this.log(`  🔍 Aumentando de ${width}x${height} (muito pequeno)...`)
      return pipeline.resize(null, 1500, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    // Normalizar para 1920px altura
    if (height !== 1920 && height > 1000 && height < 3000) {
      this.log(`  🔍 Normalizando para 1920px altura...`)
      return pipeline.resize(null, 1920, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    this.log(`  ℹ️  Tamanho OK: ${width}x${height}`)
    return pipeline
  }

  /**
   * Adiciona ajuste de brilho ao pipeline
   */
  addBrightnessAdjustment(pipeline, brightnessAnalysis) {
    const status = brightnessAnalysis.status

    if (status === 'too_dark') {
      this.log('  💡 Aumentando brilho (muito escura)...')
      return pipeline.modulate({
        brightness: 1.3,
        saturation: 1.0
      })
    }

    if (status === 'dark') {
      this.log('  💡 Aumentando brilho levemente...')
      return pipeline.modulate({
        brightness: 1.15,
        saturation: 1.0
      })
    }

    if (status === 'too_bright') {
      this.log('  🔅 Reduzindo brilho (muito clara)...')
      return pipeline.modulate({
        brightness: 0.85,
        saturation: 1.0
      })
    }

    if (status === 'bright') {
      this.log('  🔅 Reduzindo brilho levemente...')
      return pipeline.modulate({
        brightness: 0.95,
        saturation: 1.0
      })
    }

    this.log('  ℹ️  Brilho OK')
    return pipeline
  }

  /**
   * Adiciona sharpening ao pipeline
   */
  addSharpen(pipeline, sharpnessAnalysis) {
    const status = sharpnessAnalysis.status

    if (status === 'blurry') {
      this.log('  🔪 Aplicando sharpening forte...')
      return pipeline.sharpen({
        sigma: 2.0,
        m1: 1.0,
        m2: 1.0
      })
    }

    if (status === 'soft') {
      this.log('  🔪 Aplicando sharpening moderado...')
      return pipeline.sharpen({
        sigma: 1.5,
        m1: 0.7,
        m2: 0.7
      })
    }

    this.log('  ℹ️  Nitidez OK')
    return pipeline
  }
}

export default ImageEnhancer