import sharp from 'sharp'

const DEFAULT_CONFIG = {
  minScore: { base: 0.5 },

  textScore: {
    minTextLength: 15,
    minAlphaRatio: 0.5,

    weights: {
      confidence: 0.5,
      alphaRatio: 0.2,
      horizontalRatio: 0.2,
      lengthFactor: 0.1
    },

    lengthNormalization: 120
  },

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
      // 1️⃣ Teste 270°
      const buffer270 = await sharp(originalBuffer).rotate(270).toBuffer()
      const res270 = await this.ocrEngine.extract(buffer270)
      const score270 = this.calculateTextScore(res270)

      this.log(`   📝 Teste 270°: ${res270.wordCount} palavras, score ${score270}`)
      this.log(`   📝 Detalhes OCR 270°: ${JSON.stringify(res270)}`)

      if (score270 >= this.config.minScore.base) {
        return this.createResult(270, score270, 'ocr_multi_rotation', true)
      }

      // 2️⃣ Teste 90° (apenas se 270° não passou)
      const buffer90 = await sharp(originalBuffer).rotate(90).toBuffer()
      const res90 = await this.ocrEngine.extract(buffer90)
      const score90 = this.calculateTextScore(res90)

      this.log(`   📝 Teste 90°: ${res90.wordCount} palavras, score ${score90}`)
      this.log(`   📝 Detalhes OCR 90°: ${JSON.stringify(res90)}`)

      if (score90 >= this.config.minScore.base) {
        return this.createResult(90, score90, 'ocr_multi_rotation', true)
      }

      // 3️⃣ Nenhum passou → fallback
      this.log('⚠️ Sem confiança suficiente — mantendo orientação original')
      return this.createResult(0, Math.max(score270, score90), 'ocr_multi_rotation', false)

    } catch (error) {
      this.log(`⚠️ Erro no check OCR: ${error.message}`)
      return this.createResult(0, 0, 'ocr_failed')
    }
  }


  calculateTextScore(ocrResult) {
    if (!ocrResult || !ocrResult.fullText) return 0

    const {
      minTextLength,
      minAlphaRatio,
      weights,
      lengthNormalization
    } = this.config.textScore

    const text = ocrResult.fullText.trim()

    // 1️⃣ Tamanho mínimo
    if (text.length < minTextLength) return 0

    // 2️⃣ Alpha ratio
    const alphaChars = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length
    const alphaRatio = alphaChars / text.length
    if (alphaRatio < minAlphaRatio) return 0

    // 3️⃣ Confidence OCR (0–1)
    const confidence = ocrResult.confidence || 0

    // 4️⃣ Length factor normalizado (0–1)
    const lengthFactor = Math.min(text.length / lengthNormalization, 1)

    // 5️⃣ Score ponderado
    const score =
      (confidence * (weights.confidence ?? 0.5)) +
      (alphaRatio * (weights.alphaRatio ?? 0.2)) +
      (lengthFactor * (weights.lengthFactor ?? 0.3))

    return Math.min(Math.max(score, 0), 1)
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