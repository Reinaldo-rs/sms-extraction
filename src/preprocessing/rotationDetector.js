import sharp from 'sharp'

/**
 * Configuração do detector de rotação.
 * Todos os thresholds e limites são externalizados aqui.
 */
const DEFAULT_CONFIG = {
  // Heurística dimensional
  suspiciousAspectRatio: 0.4,      // height/width > 2.5x indica possível rotação
  wideAspectRatio: 2.5,            // width/height > 2.5x também indica possível rotação
  
  // Análise visual (fallback)
  visualMinSize: 100,              // Imagens < 100px não valem análise
  visualMaxSize: 10_000_000,       // Imagens > 10MP são muito caras
  visualResizeTarget: 150,         // Reduzir para análise rápida
  visualGradientThreshold: 40,     // Mínimo para considerar borda
  visualRatioThreshold: 2.0,       // Ratio vertical/horizontal para detectar rotação
  visualSampleStep: 5,             // Pular pixels na amostragem
  
  // Logs
  enableLogs: false                // Desabilitar em produção
}

/**
 * Detecta se uma imagem está rotacionada e corrige.
 * 
 * OTIMIZADO PARA: prints/screenshots em PNG (95%+ dos casos)
 * 
 * Filosofia:
 * - PNG de print = decisão instantânea baseada em dimensões
 * - Fotos (JPEG/HEIC) = EXIF primeiro, visual se necessário
 * - Evitar sharp.raw() e processamento pesado quando desnecessário
 */
class RotationDetector {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.log = this.config.enableLogs ? console.log : () => {}
  }

  /**
   * Detecta rotação da imagem.
   * 
   * Para PNG: apenas metadata + heurística dimensional (< 10ms)
   * Para JPEG/HEIC: metadata + EXIF, fallback visual se necessário
   */
  async detect(input) {
    try {
      const image = sharp(input)
      const metadata = await image.metadata()
      
      const { format, width, height } = metadata

      // PNG: decisão rápida baseada apenas em dimensões
      if (format === 'png') {
        return this.detectPngRotation(width, height)
      }

      // Fotos: EXIF primeiro
      const exifResult = this.detectFromExif(metadata)
      if (exifResult.needsRotation) {
        this.log(`📷 EXIF: ${exifResult.angle}°`)
        return exifResult
      }

      // Fallback: análise visual (raramente usado)
      if (this.shouldUseVisualAnalysis(format, width, height)) {
        this.log('🔍 Fallback visual')
        return await this.detectVisually(image, width, height)
      }

      // Default: assumir correto
      return this.createResult(0, 0.8, 'assumed_correct')

    } catch (error) {
      console.error('Erro ao detectar rotação:', error.message)
      return this.createResult(0, 0, 'error', false, { error: error.message })
    }
  }

  /**
   * Detecção para PNG: puramente dimensional.
   * Não precisa processar pixels, apenas analisar aspect ratio.
   */
  detectPngRotation(width, height) {
    const aspectRatio = width / height
    const { suspiciousAspectRatio, wideAspectRatio } = this.config

    // Extremamente vertical (altura >> largura)
    // Ex: 500x2000 = 0.25 < 0.4 → pode ser rotacionado
    if (aspectRatio < suspiciousAspectRatio) {
      this.log(`📐 PNG vertical suspeito: ${width}x${height}`)
      return this.createResult(90, 0.7, 'dimensional_vertical', true, {
        aspectRatio,
        reason: 'narrow_vertical'
      })
    }

    // Extremamente horizontal (largura >> altura)
    // Ex: 2000x500 = 4.0 > 2.5 → pode ser rotacionado
    if (aspectRatio > wideAspectRatio) {
      this.log(`📐 PNG horizontal suspeito: ${width}x${height}`)
      return this.createResult(90, 0.6, 'dimensional_horizontal', true, {
        aspectRatio,
        reason: 'narrow_horizontal'
      })
    }

    // Caso normal: PNG provavelmente correto
    this.log(`✅ PNG dimensões normais: ${width}x${height}`)
    return this.createResult(0, 0.95, 'png_default', false, { aspectRatio })
  }

  /**
   * Detecção via EXIF (fotos de câmera).
   */
  detectFromExif(metadata) {
    const { orientation } = metadata

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

  /**
   * Decide se vale a pena usar análise visual.
   * Apenas para formatos foto SEM EXIF útil.
   */
  shouldUseVisualAnalysis(format, width, height) {
    const { visualMinSize, visualMaxSize } = this.config
    const totalPixels = width * height

    // Nunca para PNG (já tratado)
    if (format === 'png') return false

    // Não para imagens muito pequenas ou muito grandes
    if (width < visualMinSize || height < visualMinSize) return false
    if (totalPixels > visualMaxSize) return false

    // Apenas para JPEG/HEIC sem EXIF
    return format === 'jpeg' || format === 'jpg' || format === 'heic'
  }

  /**
   * Análise visual: último recurso.
   * Detecta apenas rotação de 90° baseado em predominância de bordas.
   */
  async detectVisually(image, originalWidth, originalHeight) {
    try {
      const { visualResizeTarget, visualGradientThreshold, visualRatioThreshold, visualSampleStep } = this.config

      // Resize para análise rápida
      const { data, info } = await image
        .clone()
        .resize(visualResizeTarget, visualResizeTarget, { fit: 'inside' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const { horizontal, vertical } = this.computeGradients(
        data,
        info.width,
        info.height,
        visualGradientThreshold,
        visualSampleStep
      )

      const ratio = vertical / (horizontal + 1)

      // Só detecta rotação se ratio for muito alto
      if (ratio > visualRatioThreshold) {
        return this.createResult(90, 0.6, 'visual', true, {
          horizontal,
          vertical,
          ratio
        })
      }

      return this.createResult(0, 0.5, 'visual_uncertain', false, {
        horizontal,
        vertical,
        ratio
      })

    } catch (error) {
      console.error('Erro na análise visual:', error.message)
      return this.createResult(0, 0, 'visual_failed')
    }
  }

  /**
   * Calcula gradientes horizontais e verticais.
   * Amostragem esparsa para velocidade.
   */
  computeGradients(data, width, height, threshold, step) {
    let horizontal = 0
    let vertical = 0

    for (let y = 1; y < height - 1; y += step) {
      for (let x = 1; x < width - 1; x += step) {
        const idx = y * width + x

        const gx = Math.abs(data[idx + 1] - data[idx - 1])
        const gy = Math.abs(data[idx + width] - data[idx - width])

        if (gx > threshold) horizontal++
        if (gy > threshold) vertical++
      }
    }

    return { horizontal, vertical }
  }

  /**
   * Aplica rotação na imagem.
   */
  async rotate(input, angle) {
    if (angle === 0) {
      this.log('ℹ️  Sem rotação necessária')
      return input
    }

    this.log(`🔄 Rotacionando ${angle}°`)

    try {
      return await sharp(input)
        .rotate(angle)
        .toBuffer()
    } catch (error) {
      console.error('Erro ao rotacionar:', error.message)
      throw error
    }
  }

  /**
   * Detecta e corrige em uma operação.
   */
  async detectAndCorrect(input) {
    const detection = await this.detect(input)

    if (detection.needsRotation) {
      const buffer = await this.rotate(input, detection.angle)
      return { buffer, detection }
    }

    return { buffer: input, detection }
  }

  /**
   * Helper: cria objeto de resultado padronizado.
   */
  createResult(angle, confidence, method, needsRotation = angle !== 0, extra = {}) {
    return {
      angle,
      confidence,
      method,
      needsRotation,
      ...extra
    }
  }
}

export default RotationDetector