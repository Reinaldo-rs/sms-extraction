import Tesseract from 'tesseract.js'

class TesseractEngine {
  constructor(config = {}) {
    this.config = {
      lang: config.lang || 'por',
      psm: config.psm || 6,
      oem: config.oem || 3,
      enableLogs: config.enableLogs || false,
      ocrTimeout: config.ocrTimeout || 30000,
      minWordConfidence: config.minWordConfidence || 15,
      cacheSize: config.cacheSize || 100,
      whitelist: config.whitelist || null,
      ...config
    }

    this.log = this.config.enableLogs ? console.log : () => {}

    // OCR Worker
    this.ocrWorker = null
    this.ocrInitPromise = null

    // Cache de resultados
    this.cache = new Map()
  }

  // ============================================
  // OCR Worker Management
  // ============================================

  async ensureOCRWorker() {
    if (this.ocrWorker) return this.ocrWorker

    if (!this.ocrInitPromise) {
      this.ocrInitPromise = (async () => {
        this.log('🔄 Criando worker OCR...')

        const worker = await Tesseract.createWorker(
          this.config.lang,
          this.config.oem,
          {
            logger: this.config.enableLogs
              ? m => {
                  if (m.status === 'recognizing text') {
                    const progress = (m.progress * 100).toFixed(0)
                    process.stdout.write(`\r   Progresso OCR: ${progress}%`)
                  }
                }
              : undefined
          }
        )

        await worker.setParameters({
          tessedit_pageseg_mode: this.config.psm.toString(),
          tessedit_char_whitelist: this.config.whitelist || '',
          preserve_interword_spaces: '1'
        })

        this.ocrWorker = worker
        this.log('\n✅ Worker OCR pronto')
        return worker
      })()
    }

    return this.ocrInitPromise
  }

  async terminateOCR() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate()
      this.ocrWorker = null
    }
    this.ocrInitPromise = null
  }

  // ============================================
  // OCR Extraction
  // ============================================

  async extract(image) {
    const startTime = Date.now()
    let timeoutId

    try {
      // 1. Cache
      const hash = this.hashBuffer(image)
      if (this.cache.has(hash)) {
        this.log('💾 Cache hit OCR')
        return this.cache.get(hash)
      }

      // 2. Executar OCR com timeout
      const worker = await this.ensureOCRWorker()

      const ocrPromise = worker.recognize(image)
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('OCR timeout')),
          this.config.ocrTimeout
        )
      })

      const { data } = await Promise.race([ocrPromise, timeoutPromise])
      const elapsed = Date.now() - startTime

      this.log(`\n✅ OCR concluído em ${elapsed}ms`)
      this.log(`   Confiança média: ${data.confidence.toFixed(1)}%`)
      this.log(`   Palavras detectadas: ${data.words?.length ?? 0}`)

      // 3. Formatar resultado
      const result = this.formatResult(data, elapsed)

      // 4. Cache
      this.cacheResult(hash, result)

      return result
    } catch (error) {
      console.error('❌ Erro no OCR:', error.message)
      if (error.message === 'OCR timeout') {
        this.log('🛑 Timeout OCR - Reiniciando worker...')
        await this.terminateOCR()
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async extractText(image) {
    const result = await this.extract(image)
    return result.fullText
  }

  // ============================================
  // Format Result
  // ============================================

  formatResult(data, processingTime) {
    const rawWords = data.words ?? []

    const words = rawWords
      .filter(word => word.confidence > this.config.minWordConfidence)
      .filter(word => word.text.trim().length > 0)
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

    const validWordCount = words.length
    const avgConfidence = validWordCount > 0
      ? words.reduce((acc, w) => acc + w.confidence, 0) / validWordCount
      : data.confidence / 100

    return {
      engine: 'tesseract',
      fullText: data.text ?? '',
      confidence: avgConfidence,
      words: validWordCount,
      wordCount: validWordCount, // Compatibilidade com RotationDetector
      texts: words, // Array detalhado de palavras
      lines: data.lines?.length ?? 0,
      processingTime
    }
  }

  // ============================================
  // Cache
  // ============================================

  hashBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) return 'non-buffer-input'
    const size = buffer.length
    const first = buffer.slice(0, 32).toString('hex')
    const last = buffer.slice(-32).toString('hex')
    return `${size}-${first}-${last}`
  }

  cacheResult(hash, result) {
    if (this.cache.size >= this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(hash, result)
  }

  clearCache() {
    this.cache.clear()
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
      hitRate: this._calculateHitRate()
    }
  }

  _calculateHitRate() {
    // Placeholder para implementação futura de métricas
    return 0
  }

  // ============================================
  // Cleanup
  // ============================================

  async cleanup() {
    await this.terminateOCR()
    this.clearCache()
  }

  // ============================================
  // Configurações Pré-definidas
  // ============================================

  static getSMSConfig() {
    return {
      lang: 'por',
      psm: 6, // único bloco de texto uniforme (SMS)
      oem: 3,
      enableLogs: false,
      ocrTimeout: 30000,
      minWordConfidence: 15,
      cacheSize: 100,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç' +
        '0123456789' +
        ' .,:;!?-/()@#$%&*+=[]{}"\'\n'
    }
  }
}

export default TesseractEngine