import sharp from 'sharp'

const DEFAULT_CONFIG = {
  // Estratégia do OSD: 'auto' | 'always' | 'never'
  osdStrategy: 'never',  // Default: dimensional apenas (mais rápido)
  osdFormats: ['jpeg', 'jpg', 'png', 'webp'],
  osdMinConfidence: 40,
  osdMaxSize: 5_000_000,
  osdTimeout: 5000,
  enableLogs: false
}

/**
 * RotationDetector - APENAS DETECTA rotação
 * 
 * IMPORTANTE: Este módulo NÃO aplica mais a rotação!
 * A rotação é aplicada no pipeline único do Sharp no Preprocessor.
 */
class RotationDetector {
  constructor(config = {}, ocrEngine = null) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.log = this.config.enableLogs ? console.log : () => {}

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

      this.log(`🖼️ Analisando: ${format} ${width}x${height}`)

      // 1. EXIF
      const exifResult = this.detectFromExif(orientation)
      if (exifResult.needsRotation) {
        this.log(`📷 EXIF: ${exifResult.angle}°`)
        return exifResult
      }

      // 2. Dimensional
      const dimensionalResult = this.detectDimensional(width, height)

      // Se dimensional tem alta confiança, retornar
      if (dimensionalResult.confidence >= 0.8) {
        this.log(`📐 Dimensional: ${dimensionalResult.angle}° (conf: ${dimensionalResult.confidence})`)
        return dimensionalResult
      }

      // 3. OSD (Smart Fallback)
      if (this.shouldUseOSD(format, width, height, dimensionalResult.confidence)) {
        this.log(`🤔 Dúvida dimensional (${dimensionalResult.confidence}). Chamando OSD...`)
        const buffer = await image.toBuffer()
        const osdResult = await this.detectWithOSD(buffer)

        if (osdResult.confidence >= this.config.osdMinConfidence / 100) {
          this.log(`✅ OSD: ${osdResult.angle}° (conf: ${osdResult.confidence})`)
          return osdResult
        }

        this.log('⚠️ OSD inconclusivo, mantendo dimensional.')
      }

      this.log('✅ Assumindo correto (fallback)')
      return dimensionalResult

    } catch (error) {
      console.error('Erro ao detectar rotação:', error.message)
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
      angle,
      angle !== 0 ? 1.0 : 0,
      'exif',
      angle !== 0,
      { originalOrientation: orientation }
    )
  }

  detectDimensional(width, height) {
    if (!width || !height) {
      return this.createResult(0, 0, 'dimensional_invalid', false)
    }

    // Landscape → precisa rotacionar
    if (width > height) {
      this.log(`📐 Landscape detectado: ${width}x${height} → Rotacionar 90°`)
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
      0.9,
      'dimensional_simple',
      false,
      { width, height }
    )
  }

  shouldUseOSD(format, width, height, currentConfidence = 1.0) {
    const { osdStrategy, osdFormats, osdMaxSize } = this.config

    if (osdStrategy === 'never') return false
    if (!width || !height) return false
    if (!osdFormats.includes(format)) return false
    if ((width * height) > osdMaxSize) return false

    if (osdStrategy === 'always') return true
    if (osdStrategy === 'auto') return currentConfidence < 0.8

    return false
  }

  async detectWithOSD(buffer) {
    try {
      if (!this.ocrEngine) {
        this.log('⚠️ Nenhum motor OCR injetado. Criando instância local...')
        const TesseractEngine = (await import('./TesseractEngine_IMPROVED.js')).default
        this.ocrEngine = new TesseractEngine(this.config)
      }

      const osdPromise = this.ocrEngine.detectOrientation(buffer)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OSD timeout')), this.config.osdTimeout)
      )

      const result = await Promise.race([osdPromise, timeoutPromise])

      return this.createResult(
        result.degrees || 0,
        result.confidence || 0,
        'tesseract_osd',
        (result.degrees || 0) !== 0,
        { rawConfidence: result.confidence }
      )

    } catch (error) {
      this.log(`⚠️ OSD falhou: ${error.message}`)

      if (error.message === 'OSD timeout' && this.ocrEngine) {
        this.log('🛑 Reiniciando worker travado...')
        await this.ocrEngine.cleanup().catch(() => {})
      }

      return this.createResult(0, 0, 'osd_failed', false, {
        reason: error.message
      })
    }
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

  async cleanup() {
    if (this.ocrEngine && this.ocrEngine.cleanup) {
      await this.ocrEngine.cleanup()
      this.ocrEngine = null
    }
  }
}

export default RotationDetector