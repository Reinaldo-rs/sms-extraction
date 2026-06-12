import {
  WEIGHTS,
  DECISION_THRESHOLDS,
  UPSCALE,
  PRIORITY,
  getProfile,
  normalizeWeights
} from './qualityConfig.js'

/**
 * QualityPolicy - Motor de Decisões
 * 
 * RESPONSABILIDADE: Interpretar métricas e decidir ações
 * 
 * Princípios:
 * - Recebe métricas puras do QualityAnalyzer
 * - Aplica regras de negócio configuráveis
 * - Retorna decisões estruturadas
 * - Suporta múltiplos perfis (SMS, Document, Fast)
 * 
 * Separação clara:
 * - QualityAnalyzer: "O que a imagem é?"
 * - QualityPolicy: "O que fazer com ela?"
 * 
 * @example
 * const policy = new QualityPolicy({ profile: 'sms' })
 * const decisions = policy.evaluate(metrics)
 * 
 * if (decisions.needsPreprocessing) {
 *   for (const action of decisions.actions) {
 *     await preprocessor.apply(action)
 *   }
 * }
 */
class QualityPolicy {
  constructor(config = {}) {
    // Carregar profile
    const profileName = config.profile || 'SMS'
    const profile = getProfile(profileName)
    
    this.profile = profile.name
    this.weights = config.weights || profile.weights
    this.thresholds = config.thresholds || profile.thresholds
    
    // Validar e normalizar pesos
    this.weights = normalizeWeights(this.weights)
    
    // Config adicional
    this.config = {
      enableLogs: config.enableLogs ?? false,
      ...config
    }
    
    this.log = this.config.enableLogs ? console.log : () => {}
  }

  /**
   * Avalia métricas e retorna decisões estruturadas
   * 
   * @param {Object} analysis - Resultado do QualityAnalyzer.analyze()
   * @returns {Object} Decisões e ações recomendadas
   */
  evaluate(analysis) {
    const metrics = analysis.metrics
    
    this.log('\n🧠 Avaliando política...')
    
    // Calcular score geral
    const overallScore = this.calculateOverallScore(metrics)
    const grade = this.getGrade(overallScore)
    
    // Decidir se precisa preprocessamento
    const preprocessDecision = this.shouldPreprocess(metrics, overallScore)
    
    // Selecionar ações específicas
    const actions = this.selectActions(metrics)
    
    // Calcular prioridade geral
    const priority = this.calculatePriority(metrics, actions)
    
    return {
      // Score calculado
      overallScore,
      grade,
      
      // Decisão principal
      needsPreprocessing: preprocessDecision.needed,
      preprocessReason: preprocessDecision.reason,
      
      // Ações ordenadas por prioridade
      actions,
      
      // Prioridade geral
      priority,
      
      // Metadados
      profile: this.profile,
      evaluatedAt: new Date().toISOString()
    }
  }

  /**
   * Calcula score geral usando pesos configurados
   */
  calculateOverallScore(metrics) {
    const score = (
      metrics.textReadability.score * this.weights.textReadability +
      metrics.sharpness.score * this.weights.sharpness +
      metrics.contrast.score * this.weights.contrast +
      metrics.brightness.score * this.weights.brightness +
      metrics.resolution.score * this.weights.resolution
    )
    
    return parseFloat(score.toFixed(3))
  }

  /**
   * Converte score numérico em grade (A-F)
   */
  getGrade(score) {
    if (score >= 0.9) return 'A'
    if (score >= 0.8) return 'B'
    if (score >= 0.7) return 'C'
    if (score >= 0.6) return 'D'
    return 'F'
  }

  /**
   * Decide se imagem precisa de preprocessamento
   * 
   * Lógica:
   * 1. Score geral abaixo do threshold
   * 2. OU qualquer métrica crítica abaixo do threshold específico
   */
  shouldPreprocess(metrics, overallScore) {
    const reasons = []
    
    // Verificar score geral
    if (overallScore < this.thresholds.overall) {
      reasons.push({
        type: 'overall_score',
        metric: 'overall',
        value: overallScore,
        threshold: this.thresholds.overall,
        message: `Score geral (${(overallScore * 100).toFixed(1)}%) abaixo do threshold (${(this.thresholds.overall * 100).toFixed(1)}%)`
      })
    }
    
    // Verificar métricas individuais críticas
    const criticalChecks = [
      {
        name: 'textReadability',
        score: metrics.textReadability.score,
        threshold: this.thresholds.textReadability,
        message: 'Legibilidade de texto insuficiente'
      },
      {
        name: 'sharpness',
        score: metrics.sharpness.score,
        threshold: this.thresholds.sharpness,
        message: 'Nitidez insuficiente'
      },
      {
        name: 'contrast',
        score: metrics.contrast.score,
        threshold: this.thresholds.contrast,
        message: 'Contraste insuficiente'
      },
      {
        name: 'brightness',
        score: metrics.brightness.score,
        threshold: this.thresholds.brightness,
        message: 'Brilho inadequado'
      }
    ]
    
    for (const check of criticalChecks) {
      if (check.threshold > 0 && check.score < check.threshold) {
        reasons.push({
          type: 'critical_metric',
          metric: check.name,
          value: check.score,
          threshold: check.threshold,
          message: check.message
        })
      }
    }
    
    return {
      needed: reasons.length > 0,
      reason: reasons.length > 0 ? reasons[0].message : null,
      reasons
    }
  }

  /**
   * Seleciona ações específicas baseadas em métricas
   * 
   * Retorna array de ações ordenadas por prioridade
   */
  selectActions(metrics) {
    const actions = []
    
    // AÇÃO 1: Upscale (se texto pequeno)
    if (metrics.textReadability.score < 0.8) {
      const upscaleAction = this.createUpscaleAction(metrics.textReadability)
      if (upscaleAction) {
        actions.push(upscaleAction)
      }
    }
    
    // AÇÃO 2: Sharpening (se borrado)
    if (metrics.sharpness.score < this.thresholds.sharpness) {
      actions.push(this.createSharpenAction(metrics.sharpness))
    }
    
    // AÇÃO 3: Contrast adjustment (se baixo contraste)
    if (metrics.contrast.score < this.thresholds.contrast) {
      actions.push(this.createContrastAction(metrics.contrast))
    }
    
    // AÇÃO 4: Brightness adjustment (se muito escuro/claro)
    if (metrics.brightness.score < this.thresholds.brightness) {
      actions.push(this.createBrightnessAction(metrics.brightness))
    }
    
    // Ordenar por prioridade (critical > high > medium > low)
    actions.sort((a, b) => b.priority.level - a.priority.level)
    
    return actions
  }

  /**
   * Cria ação de upscale
   */
  createUpscaleAction(textReadability) {
    const { scaleFactor, targetDimensions, estimatedMinTextPx, status } = textReadability
    
    // Não fazer upscale se já está bom
    if (scaleFactor <= 1.0) {
      return null
    }
    
    // Limitar escala máxima
    const safeScale = Math.min(scaleFactor, UPSCALE.MAX_SCALE_FACTOR)
    
    // Determinar prioridade baseada em status
    let priority = PRIORITY.MEDIUM
    if (status === 'unreadable') priority = PRIORITY.CRITICAL
    else if (status === 'poor') priority = PRIORITY.HIGH
    else if (status === 'marginal') priority = PRIORITY.MEDIUM
    else priority = PRIORITY.LOW
    
    return {
      type: 'upscale',
      priority,
      params: {
        scaleFactor: parseFloat(safeScale.toFixed(2)),
        targetWidth: Math.round(targetDimensions.width),
        targetHeight: Math.round(targetDimensions.height),
        method: UPSCALE.DEFAULT_METHOD
      },
      reason: `Textos pequenos (~${estimatedMinTextPx}px) precisam de upscale`,
      metadata: {
        originalTextSize: estimatedMinTextPx,
        status
      }
    }
  }

  /**
   * Cria ação de sharpening
   */
  createSharpenAction(sharpness) {
    const { variance, status } = sharpness
    
    // Determinar intensidade baseada em variance
    let sigma = 1.0
    let priority = PRIORITY.MEDIUM
    
    if (status === 'very_blurry') {
      sigma = 2.5
      priority = PRIORITY.CRITICAL
    } else if (status === 'blurry') {
      sigma = 2.0
      priority = PRIORITY.HIGH
    } else if (status === 'soft') {
      sigma = 1.5
      priority = PRIORITY.MEDIUM
    } else {
      sigma = 1.0
      priority = PRIORITY.LOW
    }
    
    return {
      type: 'sharpen',
      priority,
      params: {
        sigma
      },
      reason: `Imagem ${status} (variance: ${variance})`,
      metadata: {
        variance,
        status
      }
    }
  }

  /**
   * Cria ação de ajuste de contraste
   */
  createContrastAction(contrast) {
    const { normalized, status } = contrast
    
    let priority = PRIORITY.MEDIUM
    let method = 'normalize'
    
    if (status === 'very_low') {
      priority = PRIORITY.HIGH
      method = 'clahe' // Contrast Limited Adaptive Histogram Equalization
    } else if (status === 'low') {
      priority = PRIORITY.MEDIUM
      method = 'normalize'
    } else if (status === 'high') {
      priority = PRIORITY.LOW
      method = 'reduce'
    }
    
    return {
      type: 'contrast',
      priority,
      params: {
        method,
        amount: status === 'very_low' ? 1.5 : 1.2
      },
      reason: `Contraste ${status} (${(normalized * 100).toFixed(1)}%)`,
      metadata: {
        normalized,
        status
      }
    }
  }

  /**
   * Cria ação de ajuste de brilho
   */
  createBrightnessAction(brightness) {
    const { normalized, status } = brightness
    
    let priority = PRIORITY.LOW
    let adjustment = 0
    
    if (status === 'too_dark') {
      priority = PRIORITY.MEDIUM
      adjustment = 0.3 // +30%
    } else if (status === 'dark') {
      priority = PRIORITY.LOW
      adjustment = 0.2 // +20%
    } else if (status === 'too_bright') {
      priority = PRIORITY.LOW
      adjustment = -0.15 // -15%
    } else if (status === 'bright') {
      priority = PRIORITY.LOW
      adjustment = -0.1 // -10%
    }
    
    return {
      type: 'brightness',
      priority,
      params: {
        adjustment
      },
      reason: `Brilho ${status} (${(normalized * 100).toFixed(1)}%)`,
      metadata: {
        normalized,
        status
      }
    }
  }

  /**
   * Calcula prioridade geral baseada nas ações
   */
  calculatePriority(metrics, actions) {
    if (actions.length === 0) {
      return PRIORITY.NONE
    }
    
    // Retornar a maior prioridade entre as ações
    const maxPriority = actions.reduce((max, action) => {
      return action.priority.level > max.level ? action.priority : max
    }, PRIORITY.NONE)
    
    return maxPriority
  }

  /**
   * Explica decisão em linguagem natural (útil para logs/debug)
   * 
   * Opcional - apenas para facilitar debug humano
   */
  explain(decisions) {
    const lines = []
    
    lines.push(`\n📋 DECISÕES (Profile: ${this.profile})`)
    lines.push(`Score: ${(decisions.overallScore * 100).toFixed(1)}% (${decisions.grade})`)
    lines.push(`Preprocessamento: ${decisions.needsPreprocessing ? '⚠️  NECESSÁRIO' : '✅ OPCIONAL'}`)
    
    if (decisions.needsPreprocessing) {
      lines.push(`Motivo: ${decisions.preprocessReason}`)
    }
    
    if (decisions.actions.length > 0) {
      lines.push(`\n💡 Ações recomendadas:`)
      decisions.actions.forEach((action, i) => {
        lines.push(`   ${i + 1}. [${action.priority.label.toUpperCase()}] ${action.type}: ${action.reason}`)
      })
    }
    
    return lines.join('\n')
  }
}

export default QualityPolicy