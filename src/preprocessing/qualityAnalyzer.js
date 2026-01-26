import sharp from 'sharp'

/**
 * Analisa a qualidade de uma imagem e sugere melhorias
 */
class QualityAnalyzer {
  /**
   * Analisa imagem e retorna score + sugestões
   * @param {Buffer|string} input - Buffer ou caminho da imagem
   * @returns {Object} - Análise completa
   */
  async analyze(input) {
    try {
      const image = sharp(input)
      const metadata = await image.metadata()
      const stats = await image.stats()

      // Análises individuais
      const resolution = this.analyzeResolution(metadata)
      const brightness = this.analyzeBrightness(stats)
      const contrast = this.analyzeContrast(stats)
      const sharpness = await this.analyzeSharpness(image)

      // Score geral (0-1)
      const overallScore = (
        resolution.score * 0.25 +
        brightness.score * 0.25 +
        contrast.score * 0.25 +
        sharpness.score * 0.25
      )

      // Sugestões de melhoria
      const suggestions = this.generateSuggestions({
        resolution,
        brightness,
        contrast,
        sharpness
      })

      return {
        score: overallScore,
        grade: this.getGrade(overallScore),
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha
        },
        analysis: {
          resolution,
          brightness,
          contrast,
          sharpness
        },
        suggestions,
        needsPreprocessing: overallScore < 0.7
      }
    } catch (error) {
      console.error('❌ Erro ao analisar qualidade:', error.message)
      throw error
    }
  }

  /**
   * Analisa resolução da imagem
   */
  analyzeResolution(metadata) {
    const { width, height } = metadata
    const pixels = width * height
    const megapixels = pixels / 1000000

    let score = 1.0
    let status = 'excellent'
    let recommendation = null

    if (megapixels < 0.5) {
      score = 0.4
      status = 'poor'
      recommendation = 'Imagem muito pequena (< 0.5MP). Use imagem maior.'
    } else if (megapixels < 2) {
      score = 0.7
      status = 'acceptable'
      recommendation = 'Resolução baixa. Imagens maiores melhoram OCR.'
    } else if (megapixels > 8) {
      score = 0.9
      status = 'good'
      recommendation = 'Resolução muito alta. Será redimensionada para performance.'
    }

    return {
      score,
      status,
      megapixels: megapixels.toFixed(2),
      dimensions: `${width}x${height}`,
      recommendation
    }
  }

  /**
   * Analisa brilho da imagem
   */
  analyzeBrightness(stats) {
    // Média dos canais (0-255)
    const avgBrightness = stats.channels.reduce((sum, channel) => 
      sum + channel.mean, 0
    ) / stats.channels.length

    // Normaliza para 0-1
    const normalized = avgBrightness / 255

    let score = 1.0
    let status = 'good'
    let recommendation = null

    if (normalized < 0.2) {
      score = 0.5
      status = 'too_dark'
      recommendation = 'Imagem muito escura. Aumentar brilho.'
    } else if (normalized < 0.3) {
      score = 0.7
      status = 'dark'
      recommendation = 'Imagem escura. Considere aumentar brilho.'
    } else if (normalized > 0.8) {
      score = 0.6
      status = 'too_bright'
      recommendation = 'Imagem muito clara. Reduzir brilho.'
    } else if (normalized > 0.7) {
      score = 0.85
      status = 'bright'
      recommendation = 'Imagem um pouco clara.'
    }

    return {
      score,
      status,
      value: normalized.toFixed(3),
      percentage: (normalized * 100).toFixed(1) + '%',
      recommendation
    }
  }

  /**
   * Analisa contraste da imagem
   */
  analyzeContrast(stats) {
    // Desvio padrão médio dos canais
    const avgStdDev = stats.channels.reduce((sum, channel) => 
      sum + channel.stdev, 0
    ) / stats.channels.length

    // Normaliza para 0-1 (contraste bom = stddev alto)
    const normalized = avgStdDev / 128

    let score = 1.0
    let status = 'good'
    let recommendation = null

    if (normalized < 0.3) {
      score = 0.5
      status = 'low'
      recommendation = 'Contraste muito baixo. Normalizar contraste.'
    } else if (normalized < 0.5) {
      score = 0.7
      status = 'acceptable'
      recommendation = 'Contraste baixo. Melhorar contraste.'
    } else if (normalized > 1.2) {
      score = 0.8
      status = 'high'
      recommendation = 'Contraste muito alto. Pode causar ruído.'
    }

    return {
      score,
      status,
      value: normalized.toFixed(3),
      stdDev: avgStdDev.toFixed(2),
      recommendation
    }
  }

  /**
   * Analisa nitidez da imagem (usa Laplacian variance)
   */
  async analyzeSharpness(image) {
    try {
      // Converte para grayscale e aplica Laplacian
      const { data, info } = await image
        .clone()
        .greyscale()
        .resize(500, 500, { fit: 'inside' }) // Reduz para velocidade
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Calcula variância (medida de nitidez)
      // Imagens borradas têm baixa variância
      const variance = this.calculateVariance(data)
      
      // Normaliza (valores típicos: 0-1000)
      const normalized = Math.min(variance / 500, 1.0)

      let score = normalized
      let status = 'good'
      let recommendation = null

      if (variance < 50) {
        score = 0.4
        status = 'blurry'
        recommendation = 'Imagem muito borrada. Aplicar sharpening.'
      } else if (variance < 100) {
        score = 0.6
        status = 'soft'
        recommendation = 'Imagem pouco nítida. Aplicar sharpening leve.'
      } else if (variance > 800) {
        score = 0.85
        status = 'sharp'
        recommendation = 'Imagem muito nítida. Pode ter ruído.'
      }

      return {
        score,
        status,
        variance: variance.toFixed(2),
        recommendation
      }
    } catch (error) {
      console.error('❌ Erro ao analisar nitidez:', error.message)
      return {
        score: 0.5,
        status: 'unknown',
        variance: 0,
        recommendation: 'Não foi possível analisar nitidez.'
      }
    }
  }

  /**
   * Calcula variância de um array (medida de dispersão)
   */
  calculateVariance(data) {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length
    const variance = data.reduce((sum, val) => {
      return sum + Math.pow(val - mean, 2)
    }, 0) / data.length

    return variance
  }

  /**
   * Gera sugestões de melhoria
   */
  generateSuggestions(analysis) {
    const suggestions = []

    // Resolução
    if (analysis.resolution.score < 0.7) {
      suggestions.push({
        priority: 'high',
        type: 'resolution',
        action: 'Use imagem com maior resolução'
      })
    }

    // Brilho
    if (analysis.brightness.status === 'too_dark') {
      suggestions.push({
        priority: 'high',
        type: 'brightness',
        action: 'Aumentar brilho em 30%'
      })
    } else if (analysis.brightness.status === 'too_bright') {
      suggestions.push({
        priority: 'medium',
        type: 'brightness',
        action: 'Reduzir brilho em 15%'
      })
    }

    // Contraste
    if (analysis.contrast.score < 0.7) {
      suggestions.push({
        priority: 'high',
        type: 'contrast',
        action: 'Normalizar contraste'
      })
    }

    // Nitidez
    if (analysis.sharpness.status === 'blurry') {
      suggestions.push({
        priority: 'high',
        type: 'sharpness',
        action: 'Aplicar sharpening forte'
      })
    } else if (analysis.sharpness.status === 'soft') {
      suggestions.push({
        priority: 'medium',
        type: 'sharpness',
        action: 'Aplicar sharpening leve'
      })
    }

    return suggestions
  }

  /**
   * Converte score em grade (A-F)
   */
  getGrade(score) {
    if (score >= 0.9) return 'A'
    if (score >= 0.8) return 'B'
    if (score >= 0.7) return 'C'
    if (score >= 0.6) return 'D'
    return 'F'
  }
}

export default QualityAnalyzer