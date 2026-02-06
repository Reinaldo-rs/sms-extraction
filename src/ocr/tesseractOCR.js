import Tesseract from 'tesseract.js'

class TesseractEngine {
  constructor(config = {}) {
    this.config = {
      lang: config.lang || 'por',
      psm: config.psm || 6,
      oem: config.oem || 3,
      enableLogs: config.enableLogs || false,
      ocrTimeout: config.ocrTimeout || 30000,      // 30s timeout para OCR
      osdTimeout: config.osdTimeout || 5000,       // 5s timeout para OSD
      minWordConfidence: config.minWordConfidence || 50,
      cacheSize: config.cacheSize || 100,
      ...config
    }

    this.log = this.config.enableLogs ? console.log : () => { }

    // OSD Worker (orientação)
    this.osdWorker = null
    this.osdInitPromise = null

    // OCR Worker (extração de texto)
    this.ocrWorker = null
    this.ocrInitPromise = null

    // Cache de resultados
    this.cache = new Map()
  }

  // ============================================
  // OSD (Orientation and Script Detection)
  // ============================================

  async ensureOSDWorker() {
    if (this.osdWorker) return this.osdWorker

    if (!this.osdInitPromise) {
      this.osdInitPromise = (async () => {
        this.log('🔄 Criando worker OSD...')
        const worker = await Tesseract.createWorker('osd', 0)
        this.osdWorker = worker
        this.log('✅ Worker OSD pronto')
        return worker
      })()
    }

    return this.osdInitPromise
  }

  async detectOrientation(imageBuffer) {
    try {
      const worker = await this.ensureOSDWorker()

      // Timeout protection
      const osdPromise = worker.detect(imageBuffer)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OSD timeout')), this.config.osdTimeout)
      )

      const { data } = await Promise.race([osdPromise, timeoutPromise])

      return {
        degrees: data.orientation_degrees || 0,
        confidence: (data.orientation_confidence || 0) / 100,
        script: data.script || 'unknown'
      }

    } catch (error) {
      console.error('⚠️ Falha no OSD:', error.message)

      // Só reiniciar worker em timeout (erro crítico)
      if (error.message === 'OSD timeout') {
        this.log('🛑 Worker OSD travado, reiniciando...')
        await this.terminateOSD()
      }

      return { degrees: 0, confidence: 0 }
    }
  }

  async terminateOSD() {
    if (this.osdWorker) {
      await this.osdWorker.terminate()
      this.osdWorker = null
    }
    this.osdInitPromise = null
  }

  // ============================================
  // OCR (Optical Character Recognition)
  // ============================================

  async ensureOCRWorker() {
    if (this.ocrWorker) return this.ocrWorker

    if (!this.ocrInitPromise) {
      this.ocrInitPromise = (async () => {
        this.log('🔄 Criando worker OCR...')
        this.log(`   Idioma: ${this.config.lang}`)
        this.log(`   PSM: ${this.config.psm}`)

        const worker = await Tesseract.createWorker(
          this.config.lang,
          this.config.oem,
          {
            logger: this.config.enableLogs
              ? m => {
                if (m.status === 'recognizing text') {
                  const progress = (m.progress * 100).toFixed(0)
                  process.stdout.write(`\r   Progresso: ${progress}%`)
                }
              }
              : undefined
          }
        )

        // Configurar parâmetros
        await worker.setParameters({
          tessedit_pageseg_mode: this.config.psm.toString(),
          tessedit_char_whitelist: this.config.whitelist || '',
          preserve_interword_spaces: '1'
        })

        this.ocrWorker = worker
        this.log('✅ Worker OCR pronto')
        return worker

      })()
    }

    return this.ocrInitPromise
  }

  async extract(image) {
    const startTime = Date.now()

    try {
      // Verificar cache
      const hash = this.hashBuffer(image)
      if (this.cache.has(hash)) {
        this.log('💾 Cache hit - retornando resultado anterior')
        return this.cache.get(hash)
      }

      this.log('🔤 Iniciando OCR...')
      this.log(`   Idioma: ${this.config.lang}`)
      this.log(`   PSM: ${this.config.psm}`)

      const worker = await this.ensureOCRWorker()

      // Timeout protection
      const ocrPromise = worker.recognize(image)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), this.config.ocrTimeout)
      )

      const { data } = await Promise.race([ocrPromise, timeoutPromise])

      const elapsed = Date.now() - startTime

      this.log(`\n✅ OCR concluído em ${elapsed}ms`)
      this.log(`   Confiança média: ${data.confidence.toFixed(1)}%`)
      this.log(`   Palavras detectadas: ${data.words?.length ?? 0}`)


      // Formatar resultado
      const result = this.formatResult(data, elapsed)

      // Cachear resultado
      this.cacheResult(hash, result)

      return result

    } catch (error) {
      console.error('❌ Erro no OCR:', error.message)

      // Só reiniciar worker em timeout (erro crítico)
      if (error.message === 'OCR timeout') {
        this.log('🛑 Worker OCR travado, reiniciando...')
        await this.terminateOCR()
      }

      throw error
    }
  }

  formatResult(data, processingTime, options = {}) {
    const minConfidence = options.minConfidence ?? this.config.minWordConfidence

    const rawWords = data.words ?? []
    const rawLines = data.lines ?? []

    const words = rawWords
      .filter(word => word.confidence > minConfidence)
      .filter(word => word.text.trim().length > 0) // Remove palavras vazias
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

  async extractText(image) {
    const result = await this.extract(image)
    return result.fullText
  }

  async terminateOCR() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate()
      this.ocrWorker = null
    }
    this.ocrInitPromise = null
  }

  // ============================================
  // Cache
  // ============================================

  hashBuffer(buffer) {
    // Hash rápido: tamanho + primeiros/últimos 32 bytes
    const size = buffer.length
    const first = buffer.slice(0, 32).toString('hex')
    const last = buffer.slice(-32).toString('hex')
    return `${size}-${first}-${last}`
  }

  cacheResult(hash, result) {
    // LRU simples: remove entrada mais antiga se cheio
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
      maxSize: this.config.cacheSize
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  async terminate() {
    await this.terminateOSD()
    await this.terminateOCR()
    this.clearCache()
  }

  // Alias para compatibilidade
  async cleanup() {
    await this.terminate()
  }

  // ============================================
  // Configurações Pré-definidas
  // ============================================

  static getSMSConfig() {
    return {
      lang: 'por',
      psm: 6,  // Assume um único bloco de texto uniforme
      oem: 3,  // Default OCR Engine Mode
      enableLogs: false,
      // Caracteres comuns em SMS
      whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç' +
        '0123456789' +
        ' .,:;!?-/()@#$%&*+=[]{}"\'\n'
    }
  }

  static getDocumentConfig() {
    return {
      lang: 'por',
      psm: 3,  // Automatic page segmentation (mais robusto)
      oem: 3,
      enableLogs: false,
      minWordConfidence: 60 // Maior threshold para documentos
    }
  }
}

export default TesseractEngine