import sharp from 'sharp'

const DEFAULT_CONFIG = {
  minScore: { text: 10, base: 50 },
  enableLogs: false,
}

/**
 * RotationDetector - APENAS DETECTA rotação 
 */
class RotationDetector {
  constructor(config = {}, ocrEngine = null) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.log = this.config.enableLogs ? console.log : () => { }

    // Lazy loading do OCR engine
    this.ocrEngine = ocrEngine
  }

  /**
   * Detecta rotação necessária (NÃO aplica!)
   * 
   * @param {Buffer|string} input - Buffer ou caminho da imagem
   * @returns {Object} - { angle, confidence, method, needsRotation }
   */
  async detect(input) {
    try {
      const image = sharp(input)
      const metadata = await image.metadata()
      const { format, width, height, orientation } = metadata

      this.log(`🖼️ Analisando: ${format} ${width}x${height} ${orientation || 1}`)

      // 1. EXIF
      const exifResult = this.detectFromExif(orientation)
      if (exifResult.needsRotation) {
        this.log(`📷 EXIF: ${exifResult.angle}°`)
        return exifResult
      }

      // 2. Dimensional
      const dimensionalResult = this.detectDimensional(width, height)
      if (dimensionalResult.confidence >= 0.8) {
        this.log(`📐 Dimensional: ${dimensionalResult.angle}° (conf: ${dimensionalResult.confidence})`)
        return dimensionalResult
      }

      // 3. Análise de Texto + OCR Multi-Rotação
      const buffer = await image.toBuffer()
      const ocrResult = await this.detectWithOCR(buffer)
      if (ocrResult.confidence > 0.5) {
        this.log(`🔍 OCR: ${ocrResult.angle}° (conf: ${ocrResult.confidence})`)
        return ocrResult
      }

      this.log('⚠️ Sem confiança suficiente — mantendo orientação original')
      return this.createResult(
        0,
        0.3,
        'fallback',
        false,
        { dimensional: dimensionalResult, ocr: ocrResult }
      )

    } catch (error) {
      this.log('⚠️ Erro ao detectar rotação:', error.message)
      return this.createResult(0, 0, 'error', false, { error: error.message })
    }
  }

  detectFromExif(orientation) {
    const rotationMap = {
      3: 180,
      6: 90,
      8: 270
    }

    const angle = rotationMap[orientation] || 0

    return this.createResult(
      0, // Sharp auto-rotaciona via EXIF, não passar ângulo manual (issue #1)
      angle !== 0 ? 1.0 : 0,
      'exif',
      angle !== 0,
      {
        originalOrientation: orientation,
        sharpAutoRotate: angle !== 0
      }
    )
  }

  detectDimensional(width, height) {
    if (!width || !height) {
      return this.createResult(0, 0, 'dimensional_invalid', false)
    }

    // Landscape → precisa rotacionar
    if (width > height) {
      this.log(`📐 Landscape detectado: ${width}x${height} → Rotacionar`)
      return this.createResult(
        90,
        0.4,
        'dimensional_simple',
        true,
        { width, height }
      )
    }

    // Portrait → correto
    this.log(`✅ Portrait detectado: ${width}x${height} → OK`)
    return this.createResult(
      0,
      0.95,
      'dimensional_simple',
      false,
      { width, height }
    )
  }

  async detectWithOCR(originalBuffer) {
    try {
      // 1. Teste 270°
      const buffer270 = await sharp(originalBuffer).rotate(270).toBuffer()
      const res270 = await this.ocrEngine.extract(buffer270)
      const score270 = this.calculateTextScore(res270)
      this.log(`   📝 Teste 270°: ${res270.wordCount} palavras, score ${score270}`)
      this.log(`   📝 Detalhes OCR 270°: ${JSON.stringify(res270)}`)

      if (score270 > this.config.minScore.base) {
        return this.createResult(270, 0.9, 'ocr_multi_rotation', true)
      }

      // 2. Teste 90°
      const buffer90 = await sharp(originalBuffer).rotate(90).toBuffer()
      const res90 = await this.ocrEngine.extract(buffer90)
      const score90 = this.calculateTextScore(res90)
      this.log(`   📝 Teste 90°: ${res90.wordCount} palavras, score ${score90}`)
      this.log(`   📝 Detalhes OCR 90°: ${JSON.stringify(res90)}`)

      // 3. Comparação
      if (score90 > (score270 * 1.5) && score90 > this.config.minScore.text) {
        return this.createResult(90, 0.85, 'ocr_multi_rotation', true)
      }

      return this.createResult(0, 0.8, 'ocr_multi_rotation', false)

    } catch (error) {
      this.log(`⚠️ Erro no check OCR: ${error.message}`)
      return this.createResult(0, 0, 'ocr_failed')
    }
  }

  // calculateTextScore(ocrResult) {
  //   if (!ocrResult) return 0

  //   const textLength = ocrResult.fullText?.trim().length || 0
  // const wordCount = ocrResult.wordCount || 0
  // const confidence = ocrResult.confidence || 0

  // return (wordCount * 10) + (textLength * 0.5) + (confidence * 100)
  // }

  calculateTextScore(ocrResult) {
  if (!ocrResult || !ocrResult.fullText) return 0

  const text = ocrResult.fullText.trim()
  if (text.length < 15) return 0 // evita falso positivo com ruído

  const confidence = ocrResult.confidence || 0

  // penaliza texto muito curto
  const lengthFactor = Math.min(text.length / 100, 1)

  return text.length * confidence * (0.5 + lengthFactor)
}

  createResult(angle, confidence, method, needsRotation = angle !== 0, extra = {}) {
    const normalizedAngle = ((angle % 360) + 360) % 360

    return {
      angle: normalizedAngle,
      confidence,
      method,
      needsRotation,
      ...extra
    }
  }
}

export default RotationDetector