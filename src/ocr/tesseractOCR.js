import Tesseract from 'tesseract.js'

class TesseractEngine {
  constructor(config = {}) {
    this.config = {
      lang: config.lang ?? 'por',
      psm: config.psm ?? 6,
      oem: config.oem ?? 3,
      enableLogs: config.enableLogs ?? false,
      ocrTimeout: config.ocrTimeout ?? 30000,
      minWordConfidence: config.minWordConfidence ?? 0,
      cacheSize: config.cacheSize ?? 100,
      whitelist: config.whitelist ?? null,
      
      // Filtragem de Palavras
      wordFiltering: {
        enabled: config.wordFiltering?.enabled ?? true,
        minLength: config.wordFiltering?.minLength ?? 3,
        minAlphaRatio: config.wordFiltering?.minAlphaRatio ?? 0.6,
        removeNumbers: config.wordFiltering?.removeNumbers ?? true,
        removeSymbols: config.wordFiltering?.removeSymbols ?? true,
        allowedSymbols: config.wordFiltering?.allowedSymbols ?? ['-', '\''],
      },
      
      ...config
    }

    this.log = this.config.enableLogs ? console.log : () => {}

    // OCR Worker
    this.ocrWorker = null
    this.ocrInitPromise = null

    // Cache de resultados
    this.cache = new Map()
    
    // Estatísticas de filtragem
    this.filterStats = {
      totalWords: 0,
      totalRejected: 0,
      rejectedByLength: 0,
      rejectedByAlpha: 0,
      rejectedBySymbols: 0
    }
    
    // Estatísticas de cache
    this.cacheStats = {
      hits: 0,
      misses: 0
    }
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
        this.cacheStats.hits++
        this.log('💾 Cache hit OCR')
        return this.cache.get(hash)
      }
      
      this.cacheStats.misses++

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
      this.log(`   Comprimento do texto: ${data.text?.length ?? 0} caracteres`)

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
  // Format Result (COM FILTRAGEM)
  // ============================================

  formatResult(data, processingTime) {
    const rawWords = data.words ?? []
    this.filterStats.totalWords += rawWords.length

    // ============================================
    // Processar palavras do Tesseract
    // ============================================
    let words = rawWords
      .filter(word => word.confidence > this.config.minWordConfidence)
      .filter(word => word.text.trim().length > 0)
      .map(word => ({
        text: word.text.trim(),
        confidence: word.confidence / 100,
        bbox: {
          left: word.bbox.x0,
          top: word.bbox.y0,
          right: word.bbox.x1,
          bottom: word.bbox.y1
        }
      }))

    // Aplicar filtragem inteligente
    const filterResult = this._applyFiltering(words, 'Filtragem principal')
    words = filterResult.words
    this.filterStats.totalRejected += filterResult.rejected

    // ============================================
    // Fallback: extrair do fullText se necessário
    // ============================================
    let fallbackWords = []
    let usedFallback = false

    if (words.length === 0 && data.text?.trim()) {
      const rawFallback = data.text
        .split(/\s+/)
        .filter(t => t.trim().length > 0)
        .map(t => ({
          text: t.trim(),
          confidence: (data.confidence ?? 0) / 100,
          bbox: { left: 0, top: 0, right: 0, bottom: 0 }
        }))

      const fallbackResult = this._applyFiltering(rawFallback, 'Fallback')
      fallbackWords = fallbackResult.words
      usedFallback = fallbackWords.length > 0

      if (this.config.enableLogs && usedFallback) {
        this.log(`   ⚠️  Usando fallback (palavras do Tesseract insuficientes)`)
      }
    }

    // ============================================
    // Resultado final
    // ============================================
    const finalWords = words.length > 0 ? words : fallbackWords
    const validWordCount = finalWords.length
    const avgConfidence = validWordCount > 0
      ? finalWords.reduce((acc, w) => acc + w.confidence, 0) / validWordCount
      : 0

    return {
      engine: 'tesseract',
      fullText: data.text ?? '',
      confidence: avgConfidence,
      words: validWordCount,
      wordCount: validWordCount,
      texts: finalWords,
      lines: data.lines?.length ?? 0,
      processingTime,
      ...(this.config.enableLogs && {
        filterStats: {
          rawWords: rawWords.length,
          filteredWords: validWordCount,
          rejected: rawWords.length - validWordCount,
          usedFallback
        }
      })
    }
  }

  // ============================================
  // MÉTODO PRIVADO: Aplicar Filtragem
  // ============================================

  _applyFiltering(wordsArray, context = '') {
    if (!this.config.wordFiltering.enabled) {
      return { words: wordsArray, rejected: 0 }
    }

    const before = wordsArray.length
    const filtered = this.filterWords(wordsArray)
    const rejected = before - filtered.length

    if (this.config.enableLogs && rejected > 0) {
      const prefix = context ? `${context}: ` : ''
      this.log(`   🔍 ${prefix}${before} → ${filtered.length} palavras (${rejected} removidas)`)
    }

    return { words: filtered, rejected }
  }

  // ============================================
  // Filtragem Inteligente de Palavras
  // ============================================

  filterWords(words) {
    const { minLength, minAlphaRatio, removeNumbers, removeSymbols, allowedSymbols } = this.config.wordFiltering

    return words.filter(word => {
      const text = word.text

      // 1. Tamanho mínimo
      if (text.length < minLength) {
        this.filterStats.rejectedByLength++
        return false
      }

      // 2. Remover apenas números
      if (removeNumbers && /^\d+$/.test(text)) {
        this.filterStats.rejectedBySymbols++
        return false
      }

      // 3. Remover apenas símbolos
      if (removeSymbols) {
        const allowedPattern = allowedSymbols.map(s => `\\${s}`).join('')
        const symbolOnlyRegex = new RegExp(`^[^a-zA-ZÀ-ÿ0-9${allowedPattern}]+$`)
        
        if (symbolOnlyRegex.test(text)) {
          this.filterStats.rejectedBySymbols++
          return false
        }
      }

      // 4. Ratio de letras alfabéticas
      const alphaChars = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length
      const alphaRatio = alphaChars / text.length

      if (alphaRatio < minAlphaRatio) {
        this.filterStats.rejectedByAlpha++
        return false
      }

      // Passou em todos os testes
      return true
    })
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
    this.cacheStats = { hits: 0, misses: 0 }
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.cacheSize,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      hitRate: this._calculateHitRate()
    }
  }

  getFilterStats() {
    return {
      ...this.filterStats,
      rejectionRate: this.filterStats.totalWords > 0
        ? ((this.filterStats.totalRejected / this.filterStats.totalWords) * 100).toFixed(1) + '%'
        : '0%'
    }
  }

  resetFilterStats() {
    this.filterStats = {
      totalWords: 0,
      totalRejected: 0,
      rejectedByLength: 0,
      rejectedByAlpha: 0,
      rejectedBySymbols: 0
    }
  }

  _calculateHitRate() {
    const total = this.cacheStats.hits + this.cacheStats.misses
    if (total === 0) return 0
    return ((this.cacheStats.hits / total) * 100).toFixed(1) + '%'
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
      psm: 6, // Uniform block of text (ideal para SMS)
      oem: 3,
      enableLogs: false,
      ocrTimeout: 30000,
      minWordConfidence: 0,
      cacheSize: 100,
      whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' +
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç' +
        '0123456789' +
        ' .,:;!?-/()@#$%&*+=[]{}"\'\n',
      
      // Filtragem otimizada para SMS
      wordFiltering: {
        enabled: true,
        minLength: 3,
        minAlphaRatio: 0.6,
        removeNumbers: true,
        removeSymbols: true,
        allowedSymbols: ['-', '\'', '.']
      }
    }
  }
}

export default TesseractEngine