import sharp from 'sharp'

/**
 * Melhora a qualidade da imagem para OCR
 */
class ImageEnhancer {
  /**
   * Aplica melhorias na imagem baseado na análise de qualidade
   * @param {Buffer|string} input - Buffer ou caminho da imagem
   * @param {Object} qualityAnalysis - Resultado do QualityAnalyzer
   * @returns {Buffer} - Imagem melhorada
   */
  async enhance(input, qualityAnalysis) {
    try {
      console.log('✨ Iniciando melhorias na imagem...')
      
      let pipeline = sharp(input)
      const metadata = await sharp(input).metadata()

      // 1. Redimensionar se necessário
      pipeline = await this.resizeIfNeeded(pipeline, metadata, qualityAnalysis)

      // 2. Ajustar brilho
      pipeline = this.adjustBrightness(pipeline, qualityAnalysis.analysis.brightness)

      // 3. Normalizar contraste
      if (qualityAnalysis.analysis.contrast.score < 0.7) {
        console.log('  📊 Normalizando contraste...')
        pipeline = pipeline.normalize()
      }

      // 4. Aplicar sharpening
      pipeline = this.applySharpen(pipeline, qualityAnalysis.analysis.sharpness)

      // 5. Reduzir ruído (se necessário)
      if (qualityAnalysis.analysis.sharpness.status === 'sharp') {
        console.log('  🔇 Reduzindo ruído...')
        pipeline = pipeline.median(3)
      }

      // 6. Converter para formato otimizado para OCR
      pipeline = pipeline
        .toColorspace('srgb')
        .removeAlpha()

      const enhanced = await pipeline.toBuffer()
      console.log('✅ Imagem melhorada com sucesso')

      return enhanced

    } catch (error) {
      console.error('❌ Erro ao melhorar imagem:', error.message)
      throw error
    }
  }

  /**
   * Redimensiona imagem se necessário
   */
  async resizeIfNeeded(pipeline, metadata, qualityAnalysis) {
    const { width, height } = metadata
    const megapixels = (width * height) / 1000000

    // Muito grande (> 8MP) = reduzir para performance
    if (megapixels > 8) {
      console.log(`  📏 Redimensionando de ${width}x${height} (muito grande)...`)
      return pipeline.resize(null, 1920, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    // Muito pequeno (< 1000px altura) = aumentar para melhor OCR
    if (height < 1000) {
      console.log(`  📏 Aumentando de ${width}x${height} (muito pequeno)...`)
      return pipeline.resize(null, 1500, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    // Ideal: 1920px altura
    if (height !== 1920 && height > 1000 && height < 3000) {
      console.log(`  📏 Normalizando para 1920px altura...`)
      return pipeline.resize(null, 1920, {
        kernel: sharp.kernel.lanczos3,
        fit: 'inside'
      })
    }

    console.log(`  ℹ️  Tamanho OK: ${width}x${height}`)
    return pipeline
  }

  /**
   * Ajusta brilho da imagem
   */
  adjustBrightness(pipeline, brightnessAnalysis) {
    const status = brightnessAnalysis.status

    if (status === 'too_dark') {
      console.log('  💡 Aumentando brilho (muito escura)...')
      return pipeline.modulate({
        brightness: 1.3,  // +30%
        saturation: 1.0
      })
    }

    if (status === 'dark') {
      console.log('  💡 Aumentando brilho levemente...')
      return pipeline.modulate({
        brightness: 1.15,  // +15%
        saturation: 1.0
      })
    }

    if (status === 'too_bright') {
      console.log('  🔅 Reduzindo brilho (muito clara)...')
      return pipeline.modulate({
        brightness: 0.85,  // -15%
        saturation: 1.0
      })
    }

    if (status === 'bright') {
      console.log('  🔅 Reduzindo brilho levemente...')
      return pipeline.modulate({
        brightness: 0.95,  // -5%
        saturation: 1.0
      })
    }

    console.log('  ℹ️  Brilho OK')
    return pipeline
  }

  /**
   * Aplica sharpening (nitidez)
   */
  applySharpen(pipeline, sharpnessAnalysis) {
    const status = sharpnessAnalysis.status

    if (status === 'blurry') {
      console.log('  🔪 Aplicando sharpening forte...')
      return pipeline.sharpen({
        sigma: 2.0,
        m1: 1.0,
        m2: 1.0
      })
    }

    if (status === 'soft') {
      console.log('  🔪 Aplicando sharpening moderado...')
      return pipeline.sharpen({
        sigma: 1.5,
        m1: 0.7,
        m2: 0.7
      })
    }

    console.log('  ℹ️  Nitidez OK')
    return pipeline
  }

  /**
   * Pipeline completo de preprocessamento (all-in-one)
   */
  async preprocessForOCR(input) {
    try {
      console.log('🔧 Preprocessamento rápido para OCR...')
      
      const pipeline = await sharp(input)
        .resize(null, 1920, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
        .normalize()
        .sharpen({ sigma: 1.5, m1: 0.7, m2: 0.7 })
        .median(3)
        .greyscale()
        .toBuffer()

      console.log('✅ Preprocessamento concluído')
      return pipeline

    } catch (error) {
      console.error('❌ Erro no preprocessamento:', error.message)
      throw error
    }
  }
}

export default ImageEnhancer