import Tesseract from 'tesseract.js'

/**
 * Engine de OCR usando Tesseract.js
 */
class TesseractEngine {
  constructor(config = {}) {
    this.config = {
      lang: config.lang || 'por',
      psm: config.psm || 6,
      oem: config.oem || 3,
      ...config
    }
  }

  /**
   * Extrai texto da imagem
   * @param {Buffer|string} image - Buffer ou caminho da imagem
   * @returns {Object} - Texto extraído + metadados
   */
  async extract(image) {
    const startTime = Date.now()

    try {
      console.log('🔤 Iniciando OCR com Tesseract...')
      console.log(`   Idioma: ${this.config.lang}`)
      console.log(`   PSM: ${this.config.psm}`)

      // ✅ CORREÇÃO: Na versão 7.x, createWorker já aceita o idioma e opções
      const worker = await Tesseract.createWorker(this.config.lang, this.config.oem, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const progress = (m.progress * 100).toFixed(0)
            process.stdout.write(`\r   Progresso: ${progress}%`)
          }
        }
      })

      // Configurar parâmetros
      await worker.setParameters({
        tessedit_pageseg_mode: this.config.psm.toString(),
        tessedit_char_whitelist: this.config.whitelist || '',
        preserve_interword_spaces: '1'
      })

      // Executar OCR
      const { data } = await worker.recognize(image)

      // Finalizar worker
      await worker.terminate()

      const elapsed = Date.now() - startTime
      console.log(`\n✅ OCR concluído em ${elapsed}ms`)
      console.log(`   Confiança média: ${data.confidence.toFixed(1)}%`)

      const wordsCount = data.words?.length ?? 0
      console.log(`   Palavras detectadas: ${wordsCount}`)

      // Formatar resultado
      return this.formatResult(data, elapsed)

    } catch (error) {
      console.error('❌ Erro no Tesseract OCR:', error.message)
      throw error
    }
  }

  /**
   * Formata resultado do Tesseract para formato padrão
   */
  formatResult(data, processingTime) {
    // Filtra palavras com confiança mínima
    const minConfidence = 50

    const rawWords = data.words ?? []
    const rawLines = data.lines ?? []

    const words = rawWords
      .filter(word => word.confidence > minConfidence)
      .map(word => ({
        text: word.text,
        confidence: word.confidence / 100,
        bbox: {
          left: word.bbox.x0,
          top: word.bbox.y0,
          right: word.bbox.x1,
          bottom: word.bbox.y1
        }
      }))

    return {
      engine: 'tesseract',
      texts: words,
      fullText: data.text ?? '',
      lines: rawLines.length,
      words: words.length,
      confidence: (data.confidence ?? 0) / 100,
      processingTime
    }
  }

  /**
   * Extrai apenas texto simples (sem metadados)
   */
  async extractText(image) {
    const result = await this.extract(image)
    return result.fullText
  }

  /**
   * Configurações otimizadas para SMS
   */
  static getSMSConfig() {
    return {
      lang: 'por',
      psm: 6,  // Assume um único bloco de texto uniforme
      oem: 3,  // Default OCR Engine Mode
      // Caracteres comuns em SMS brasileiro
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç' +
        '0123456789' +
        ' .,:;!?-/()@#$%&*+=[]{}"\'\n'
    }
  }
}

export default TesseractEngine