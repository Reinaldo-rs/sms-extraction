import sharp from 'sharp'

/**
 * Detecta se uma imagem está rotacionada e corrige
 */
class RotationDetector {
  /**
   * Detecta rotação da imagem
   * @param {Buffer|string} input - Buffer ou caminho da imagem
   * @returns {Object} - Ângulo detectado e confiança
   */
  async detect(input) {
    try {
      const image = sharp(input)
      const metadata = await image.metadata()

      // Estratégia 1: Verificar EXIF orientation (mais rápido e preciso)
      const exifRotation = this.detectFromExif(metadata)
      
      if (exifRotation.angle !== 0) {
        console.log(`🔄 Rotação detectada via EXIF: ${exifRotation.angle}°`)
        return exifRotation
      }

      // Estratégia 2: Análise visual (mais lento)
      console.log('🔍 EXIF não disponível, analisando visualmente...')
      const visualRotation = await this.detectVisually(image)
      
      return visualRotation

    } catch (error) {
      console.error('❌ Erro ao detectar rotação:', error.message)
      return {
        angle: 0,
        confidence: 0,
        method: 'error',
        needsRotation: false
      }
    }
  }

  /**
   * Detecta rotação via metadados EXIF
   */
  detectFromExif(metadata) {
    const orientation = metadata.orientation

    // Mapeamento EXIF orientation para graus
    const orientationMap = {
      1: 0,    // Normal
      2: 0,    // Flip horizontal
      3: 180,  // Rotate 180
      4: 0,    // Flip vertical
      5: 0,    // Flip horizontal + rotate 270 CW
      6: 90,   // Rotate 90 CW
      7: 0,    // Flip horizontal + rotate 90 CW
      8: 270   // Rotate 270 CW
    }

    const angle = orientationMap[orientation] || 0

    return {
      angle,
      confidence: angle !== 0 ? 1.0 : 0,
      method: 'exif',
      needsRotation: angle !== 0,
      originalOrientation: orientation
    }
  }

  /**
   * Detecta rotação analisando a imagem visualmente
   * (simplificado - detecta apenas 90, 180, 270 graus)
   */
  async detectVisually(image) {
    try {
      // Reduz imagem para análise rápida
      const { data, info } = await image
        .clone()
        .resize(200, 200, { fit: 'inside' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })

      // Detecta predominância de linhas horizontais vs verticais
      const { horizontal, vertical } = this.detectEdgeDirection(data, info.width, info.height)

      // Se muitas linhas verticais, provavelmente rotacionada 90° ou 270°
      let angle = 0
      let confidence = 0.5

      const ratio = vertical / (horizontal + 1)

      if (ratio > 1.5) {
        // Muitas linhas verticais = rotação de 90° ou 270°
        // Por simplicidade, assumimos 90° (mais comum)
        angle = 90
        confidence = Math.min(ratio / 2, 1.0)
      } else if (ratio < 0.5) {
        // Muitas linhas horizontais = provavelmente normal
        angle = 0
        confidence = 0.8
      }

      return {
        angle,
        confidence,
        method: 'visual',
        needsRotation: angle !== 0,
        analysis: { horizontal, vertical, ratio }
      }

    } catch (error) {
      console.error('❌ Erro na análise visual:', error.message)
      return {
        angle: 0,
        confidence: 0,
        method: 'visual_failed',
        needsRotation: false
      }
    }
  }

  /**
   * Detecta direção predominante das bordas (simplificado)
   */
  detectEdgeDirection(data, width, height) {
    let horizontal = 0
    let vertical = 0

    // Amostragem a cada 4 pixels para velocidade
    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const idx = y * width + x

        // Gradiente horizontal
        const gx = Math.abs(data[idx + 1] - data[idx - 1])
        
        // Gradiente vertical
        const gy = Math.abs(data[idx + width] - data[idx - width])

        if (gx > 30) horizontal++
        if (gy > 30) vertical++
      }
    }

    return { horizontal, vertical }
  }

  /**
   * Aplica rotação na imagem
   */
  async rotate(input, angle) {
    try {
      if (angle === 0) {
        console.log('ℹ️  Sem rotação necessária')
        return input
      }

      console.log(`🔄 Rotacionando ${angle}°...`)
      
      const rotated = await sharp(input)
        .rotate(angle)
        .toBuffer()

      console.log('✅ Imagem rotacionada com sucesso')
      return rotated

    } catch (error) {
      console.error('❌ Erro ao rotacionar imagem:', error.message)
      throw error
    }
  }
}

export default RotationDetector