import sharp from 'sharp'
import {
  TEXT_SIZE,
  RESOLUTION,
  SHARPNESS,
  CONTRAST,
  BRIGHTNESS,
  STATUS
} from './qualityConfig.js'

/**
 * 
 * RESPONSABILIDADE: Medir qualidade de imagem
 * 
 * Princípios:
 * - Retorna apenas dados estruturados e normalizados
 * 
 * @example
 * const analyzer = new QualityAnalyzer()
 * const metrics = await analyzer.analyze(imageBuffer)
 */
class QualityAnalyzer {
  constructor(config = {}) {
    this.config = {
      enableLogs: config.enableLogs ?? false,
      ...config
    }
    
    this.log = this.config.enableLogs ? console.log : () => {}
  }

  /**
   * Analisa imagem e retorna métricas puras
   * 
   * @param {Buffer|string} input - Buffer ou caminho da imagem
   * @returns {Promise<Object>} Métricas estruturadas (sem decisões)
   */
  async analyze(input) {
    try {
      const image = sharp(input)
      const metadata = await image.metadata()
      const stats = await image.stats()

      this.log(`\n📊 Analisando qualidade...`)
      this.log(`   Dimensões: ${metadata.width}x${metadata.height}`)

      // Análises individuais (todas independentes)
      const resolution = this.analyzeResolution(metadata)
      const textReadability = this.analyzeTextReadability(metadata)
      const brightness = this.analyzeBrightness(stats)
      const contrast = this.analyzeContrast(stats)
      const sharpness = await this.analyzeSharpness(image, metadata)

      // Score geral é calculado FORA (por Policy)
      // Aqui apenas retornamos as métricas brutas

      return {
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha,
          space: metadata.space
        },
        metrics: {
          resolution,
          textReadability,
          brightness,
          contrast,
          sharpness
        },
        // Timestamp para auditoria
        analyzedAt: new Date().toISOString()
      }

    } catch (error) {
      this.log('❌ Erro ao analisar:', error.message)
      throw new Error(`QualityAnalyzer: ${error.message}`)
    }
  }

  /**
   * Analisa resolução com detecção de formato SMS
   * 
   * Retorna:
   * - score: 0-1 (normalizado)
   * - status: classificação semântica
   * - dimensões brutas
   * - detecção de formato
   * - estimativa de altura mínima de texto
   */
  analyzeResolution(metadata) {
    const { width, height } = metadata
    const pixels = width * height
    const megapixels = pixels / 1000000
    const aspectRatio = height / width

    // Detectar formato SMS (vertical longo)
    const isSMSFormat = aspectRatio > RESOLUTION.SMS.ASPECT_RATIO_THRESHOLD

    let score = 1.0
    let status = STATUS.RESOLUTION.EXCELLENT
    let estimatedMinTextHeight = null

    if (isSMSFormat) {
      // Para SMS, altura é crítica
      estimatedMinTextHeight = Math.round(height * TEXT_SIZE.SMS_MIN_TEXT_RATIO)

      if (height < RESOLUTION.SMS.MIN_HEIGHT_POOR) {
        score = 0.4
        status = STATUS.RESOLUTION.TOO_LOW_FOR_SMALL_TEXT
      } else if (height < RESOLUTION.SMS.MIN_HEIGHT_MARGINAL) {
        score = 0.65
        status = STATUS.RESOLUTION.MARGINAL_FOR_SMALL_TEXT
      } else if (height < RESOLUTION.SMS.MIN_HEIGHT_GOOD) {
        score = 0.85
        status = STATUS.RESOLUTION.GOOD
      } else {
        score = 1.0
        status = STATUS.RESOLUTION.EXCELLENT
      }

    } else {
      // Para imagens gerais, usar megapixels
      if (megapixels < RESOLUTION.GENERAL.POOR_MP) {
        score = 0.4
        status = STATUS.RESOLUTION.POOR
      } else if (megapixels < RESOLUTION.GENERAL.ACCEPTABLE_MP) {
        score = 0.7
        status = STATUS.RESOLUTION.ACCEPTABLE
      } else if (megapixels > RESOLUTION.GENERAL.LARGE_MP) {
        score = 0.9
        status = STATUS.RESOLUTION.GOOD
      }
    }

    return {
      score,
      status,
      // Dados brutos
      width,
      height,
      pixels,
      megapixels: parseFloat(megapixels.toFixed(2)),
      aspectRatio: parseFloat(aspectRatio.toFixed(2)),
      isSMSFormat,
      estimatedMinTextHeight
    }
  }

  /**
   * Analisa legibilidade de texto
   * 
   * Estima tamanho de textos pequenos e calcula fator de escala necessário
   * 
   * IMPORTANTE: Baseado em heurística (height * ratio)
   * TODO: Substituir por text detection real quando viável
   */
  analyzeTextReadability(metadata) {
    const { width, height } = metadata
    const aspectRatio = height / width
    const isSMSFormat = aspectRatio > RESOLUTION.SMS.ASPECT_RATIO_THRESHOLD

    // Estimar altura mínima de texto
    const ratio = isSMSFormat 
      ? TEXT_SIZE.SMS_MIN_TEXT_RATIO 
      : TEXT_SIZE.DOCUMENT_MIN_TEXT_RATIO

    const estimatedMinTextPx = height * ratio
    const idealMinTextPx = TEXT_SIZE.IDEAL_MIN_HEIGHT_PX
    
    // Calcular fator de escala necessário para atingir ideal
    const scaleFactor = idealMinTextPx / estimatedMinTextPx
    const targetHeight = scaleFactor > 1 ? Math.round(height * scaleFactor) : height
    const targetWidth = scaleFactor > 1 ? Math.round(width * scaleFactor) : width
    
    // Score baseado em quão próximo está do ideal
    let score = Math.min(estimatedMinTextPx / idealMinTextPx, 1.0)
    let status = STATUS.TEXT.GOOD

    // Classificação
    if (estimatedMinTextPx < TEXT_SIZE.UNREADABLE_THRESHOLD) {
      score = 0.2
      status = STATUS.TEXT.UNREADABLE
    } else if (estimatedMinTextPx < TEXT_SIZE.POOR_THRESHOLD) {
      score = 0.4
      status = STATUS.TEXT.POOR
    } else if (estimatedMinTextPx < TEXT_SIZE.MARGINAL_THRESHOLD) {
      score = 0.6
      status = STATUS.TEXT.MARGINAL
    } else if (estimatedMinTextPx < TEXT_SIZE.ACCEPTABLE_THRESHOLD) {
      score = 0.8
      status = STATUS.TEXT.ACCEPTABLE
    } else if (estimatedMinTextPx < TEXT_SIZE.GOOD_THRESHOLD) {
      score = 0.95
      status = STATUS.TEXT.GOOD
    } else {
      score = 1.0
      status = STATUS.TEXT.EXCELLENT
    }

    return {
      score,
      status,
      // Dados brutos
      estimatedMinTextPx: Math.round(estimatedMinTextPx),
      idealMinTextPx,
      optimalTextPx: TEXT_SIZE.OPTIMAL_HEIGHT_PX,
      scaleFactor: parseFloat(scaleFactor.toFixed(2)),
      targetDimensions: {
        width: targetWidth,
        height: targetHeight
      },
      currentDimensions: {
        width,
        height
      }
    }
  }

  /**
   * Analisa brilho médio da imagem
   * 
   * Calcula média dos canais normalizada para 0-1
   */
  analyzeBrightness(stats) {
    // Média dos canais (0-255)
    const avgBrightness = stats.channels.reduce(
      (sum, channel) => sum + channel.mean, 
      0
    ) / stats.channels.length

    // Normalizar para 0-1
    const normalized = avgBrightness / BRIGHTNESS.MAX_VALUE

    let score = 1.0
    let status = STATUS.BRIGHTNESS.GOOD

    // Classificação
    if (normalized < BRIGHTNESS.TOO_DARK_THRESHOLD) {
      score = BRIGHTNESS.TOO_DARK_SCORE
      status = STATUS.BRIGHTNESS.TOO_DARK
    } else if (normalized < BRIGHTNESS.DARK_THRESHOLD) {
      score = BRIGHTNESS.DARK_SCORE
      status = STATUS.BRIGHTNESS.DARK
    } else if (normalized > BRIGHTNESS.TOO_BRIGHT_THRESHOLD) {
      score = BRIGHTNESS.TOO_BRIGHT_SCORE
      status = STATUS.BRIGHTNESS.TOO_BRIGHT
    } else if (normalized > BRIGHTNESS.BRIGHT_THRESHOLD) {
      score = BRIGHTNESS.BRIGHT_SCORE
      status = STATUS.BRIGHTNESS.BRIGHT
    } else {
      score = BRIGHTNESS.GOOD_SCORE
      status = STATUS.BRIGHTNESS.GOOD
    }

    return {
      score,
      status,
      // Dados brutos
      normalized: parseFloat(normalized.toFixed(3)),
      mean: parseFloat(avgBrightness.toFixed(2)),
      percentage: parseFloat((normalized * 100).toFixed(1))
    }
  }

  /**
   * Analisa contraste usando desvio padrão global
   * 
   * StdDev alto = boa separação tonal
   * StdDev baixo = imagem flat/baixo contraste
   */
  analyzeContrast(stats) {
    // Desvio padrão médio dos canais
    const avgStdDev = stats.channels.reduce(
      (sum, channel) => sum + channel.stdev, 
      0
    ) / stats.channels.length

    // Normalizar para 0-1+
    const normalized = avgStdDev / CONTRAST.STDDEV_NORMALIZER

    let score = 1.0
    let status = STATUS.CONTRAST.GOOD

    // Classificação
    if (normalized < CONTRAST.VERY_LOW_THRESHOLD) {
      score = CONTRAST.VERY_LOW_SCORE
      status = STATUS.CONTRAST.VERY_LOW
    } else if (normalized < CONTRAST.LOW_THRESHOLD) {
      score = CONTRAST.LOW_SCORE
      status = STATUS.CONTRAST.LOW
    } else if (normalized > CONTRAST.HIGH_THRESHOLD) {
      score = CONTRAST.HIGH_SCORE
      status = STATUS.CONTRAST.HIGH
    } else {
      score = CONTRAST.GOOD_SCORE
      status = STATUS.CONTRAST.GOOD
    }

    return {
      score,
      status,
      // Dados brutos
      normalized: parseFloat(normalized.toFixed(3)),
      stdDev: parseFloat(avgStdDev.toFixed(2))
    }
  }

  /**
   * Analisa nitidez usando Laplacian Variance REAL
   * 
   * Processo:
   * 1. Converte para grayscale
   * 2. Limita resolução se muito grande (evitar OOM)
   * 3. Aplica kernel Laplacian (detecta bordas)
   * 4. Calcula variância das bordas
   * 
   * Variance alta = muitas bordas nítidas = imagem sharp
   * Variance baixa = poucas bordas = imagem borrada
   */
  async analyzeSharpness(image, metadata) {
    try {
      const { width, height } = metadata
      
      // Limitar dimensão apenas se muito grande (evitar OOM)
      let analysisWidth = width
      let analysisHeight = height
      
      const maxDim = RESOLUTION.MAX_ANALYSIS_DIMENSION
      
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        analysisWidth = Math.round(width * scale)
        analysisHeight = Math.round(height * scale)
        
        this.log(`   ⚠️  Limitando análise: ${width}x${height} → ${analysisWidth}x${analysisHeight}`)
      }

      // Aplicar Laplacian REAL
      const { data } = await image
        .clone()
        .greyscale()
        .resize(analysisWidth, analysisHeight, { 
          fit: 'inside',
          kernel: 'lanczos3'
        })
        .convolve({
          width: 3,
          height: 3,
          kernel: [
             0, -1,  0,
            -1,  4, -1,
             0, -1,  0
          ]
        })
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Calcular variância das bordas
      const variance = this.calculateVariance(data)
      
      // Normalizar
      const normalized = Math.min(
        variance / SHARPNESS.VARIANCE_NORMALIZER, 
        1.0
      )

      let score = normalized
      let status = STATUS.SHARPNESS.SHARP

      // Classificação
      if (variance < SHARPNESS.VERY_BLURRY_THRESHOLD) {
        score = SHARPNESS.VERY_BLURRY_SCORE
        status = STATUS.SHARPNESS.VERY_BLURRY
      } else if (variance < SHARPNESS.BLURRY_THRESHOLD) {
        score = SHARPNESS.BLURRY_SCORE
        status = STATUS.SHARPNESS.BLURRY
      } else if (variance < SHARPNESS.SOFT_THRESHOLD) {
        score = SHARPNESS.SOFT_SCORE
        status = STATUS.SHARPNESS.SOFT
      } else if (variance < SHARPNESS.SHARP_THRESHOLD) {
        score = SHARPNESS.SHARP_SCORE
        status = STATUS.SHARPNESS.SHARP
      } else {
        score = SHARPNESS.VERY_SHARP_SCORE
        status = STATUS.SHARPNESS.VERY_SHARP
      }

      return {
        score,
        status,
        // Dados brutos
        variance: parseFloat(variance.toFixed(2)),
        normalized: parseFloat(normalized.toFixed(3)),
        // Info de processamento
        analyzedAt: {
          width: analysisWidth,
          height: analysisHeight,
          wasDownscaled: analysisWidth < width || analysisHeight < height
        }
      }

    } catch (error) {
      this.log('❌ Erro em analyzeSharpness:', error.message)
      
      // Retornar valores default em caso de erro
      return {
        score: 0.5,
        status: 'unknown',
        variance: 0,
        normalized: 0,
        error: error.message
      }
    }
  }

  /**
   * Calcula variância de um array
   * 
   * Usa algoritmo two-pass (simples e correto)
   * TODO: Considerar Welford (one-pass) se performance for crítica
   */
  calculateVariance(data) {
    const n = data.length
    
    // Média
    const mean = data.reduce((sum, val) => sum + val, 0) / n
    
    // Variância
    const variance = data.reduce((sum, val) => {
      return sum + Math.pow(val - mean, 2)
    }, 0) / n

    return variance
  }
}

export default QualityAnalyzer