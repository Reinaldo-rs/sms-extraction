/**
 * Constantes centralizadas para análise de qualidade de imagem
 * 
 * IMPORTANTE: Valores atuais são baseados em:
 * - Heurísticas iniciais (marcados como [HEURISTIC])
 * - Especificações do Tesseract OCR (marcados como [TESSERACT])
 * - Limitações técnicas (marcados como [TECHNICAL])
 * 
 * TODO: Calibrar com dados reais de OCR (ver calibration/calibrate.js)
 */

/**
 * Constantes de tamanho de texto
 * 
 * Baseadas em análise de prints de SMS típicos:
 * - Tela 1080p: hora/nome ocupam ~12-16px
 * - Isso representa ~1.1-1.5% da altura total
 * - Conservadoramente usamos 1.2% como estimativa
 */
export const TEXT_SIZE = {
  // Estimativa de altura mínima de texto como % da altura total
  SMS_MIN_TEXT_RATIO: 0.012,        // [HEURISTIC] Textos pequenos (hora, nome)
  DOCUMENT_MIN_TEXT_RATIO: 0.015,   // [HEURISTIC] Documentos geralmente têm texto maior
  
  // Tamanhos ideais para OCR (baseado em especificações do Tesseract)
  IDEAL_MIN_HEIGHT_PX: 20,          // [TESSERACT] Funciona bem com ≥20px
  OPTIMAL_HEIGHT_PX: 30,            // [TESSERACT] Ideal para máxima precisão
  MINIMUM_READABLE_PX: 12,          // [TESSERACT] Abaixo disso, OCR falha severamente
  
  // Thresholds para classificação
  UNREADABLE_THRESHOLD: 8,          // [HEURISTIC] < 8px = impossível ler
  POOR_THRESHOLD: 12,               // [HEURISTIC] < 12px = OCR muito ruim
  MARGINAL_THRESHOLD: 16,           // [HEURISTIC] < 16px = OCR limitado
  ACCEPTABLE_THRESHOLD: 20,         // [TESSERACT] ≥ 20px = OCR funcional
  GOOD_THRESHOLD: 30                // [TESSERACT] ≥ 30px = OCR excelente
}

/**
 * Limites de resolução
 */
export const RESOLUTION = {
  // Limites de processamento (evitar estouro de memória)
  MAX_ANALYSIS_DIMENSION: 3000,     // [TECHNICAL] Sharp processa bem até 3000px
  MEMORY_SAFE_DIMENSION: 2000,      // [TECHNICAL] Totalmente seguro
  
  // Classificação de resolução para SMS (vertical longo)
  SMS: {
    ASPECT_RATIO_THRESHOLD: 1.5,    // [HEURISTIC] height/width > 1.5 = vertical
    MIN_HEIGHT_POOR: 800,            // [HEURISTIC] Muito baixo
    MIN_HEIGHT_MARGINAL: 1200,       // [HEURISTIC] Marginal
    MIN_HEIGHT_GOOD: 1800,           // [HEURISTIC] Bom
    MIN_HEIGHT_EXCELLENT: 2400       // [HEURISTIC] Excelente
  },
  
  // Classificação geral (megapixels)
  GENERAL: {
    POOR_MP: 0.5,                    // [HEURISTIC] < 0.5MP = muito pequeno
    ACCEPTABLE_MP: 2.0,              // [HEURISTIC] < 2MP = aceitável
    LARGE_MP: 8.0                    // [HEURISTIC] > 8MP = grande (redimensionar)
  }
}

/**
 * Limites de upscale
 */
export const UPSCALE = {
  MAX_SCALE_FACTOR: 3.0,             // [TECHNICAL] Limitar para evitar overhead
  MIN_SCALE_FACTOR: 1.0,             // [TECHNICAL] Não faz sentido < 1.0
  
  // Métodos de interpolação (Sharp kernel options)
  METHODS: {
    NEAREST: 'nearest',              // Mais rápido, qualidade ruim
    CUBIC: 'cubic',                  // Rápido, boa qualidade
    MITCHELL: 'mitchell',            // Balanceado
    LANCZOS2: 'lanczos2',           // Lento, muito boa qualidade
    LANCZOS3: 'lanczos3'            // Mais lento, melhor qualidade
  },
  
  // Escolha padrão (pode ser override por policy)
  DEFAULT_METHOD: 'lanczos3'         // [CHOICE] Sempre melhor qualidade
}

/**
 * Thresholds de nitidez (Laplacian Variance)
 * 
 * Valores após aplicação de kernel Laplacian 3x3
 * Variance típica: 0-2000
 * 
 * TODO: Calibrar com dataset real
 */
export const SHARPNESS = {
  // Normalização
  VARIANCE_NORMALIZER: 1000,         // [HEURISTIC] Normalizar para 0-1
  
  // Thresholds absolutos (variance após Laplacian)
  VERY_BLURRY_THRESHOLD: 100,        // [HEURISTIC] < 100 = muito borrado
  BLURRY_THRESHOLD: 200,             // [HEURISTIC] < 200 = borrado
  SOFT_THRESHOLD: 400,               // [HEURISTIC] < 400 = pouco nítido
  SHARP_THRESHOLD: 800,              // [HEURISTIC] < 800 = nítido
  VERY_SHARP_THRESHOLD: 1500,        // [HEURISTIC] > 1500 = possível ruído
  
  // Scores normalizados (0-1)
  VERY_BLURRY_SCORE: 0.3,
  BLURRY_SCORE: 0.5,
  SOFT_SCORE: 0.7,
  SHARP_SCORE: 0.9,
  VERY_SHARP_SCORE: 1.0
}

/**
 * Thresholds de contraste (Standard Deviation)
 * 
 * StdDev típico: 0-128 (para imagens 8-bit)
 * Normalizado: stdDev / 128
 * 
 * TODO: Considerar análise de histogram bimodal para SMS
 */
export const CONTRAST = {
  // Normalização
  STDDEV_NORMALIZER: 128,            // [TECHNICAL] Max stddev para 8-bit
  
  // Thresholds normalizados
  VERY_LOW_THRESHOLD: 0.3,           // [HEURISTIC] < 0.3 = muito baixo
  LOW_THRESHOLD: 0.5,                // [HEURISTIC] < 0.5 = baixo
  HIGH_THRESHOLD: 1.2,               // [HEURISTIC] > 1.2 = muito alto (ruído)
  
  // Scores
  VERY_LOW_SCORE: 0.5,
  LOW_SCORE: 0.7,
  GOOD_SCORE: 1.0,
  HIGH_SCORE: 0.8
}

/**
 * Thresholds de brilho (média normalizada)
 * 
 * Brightness: média dos canais / 255
 * Range: 0-1
 */
export const BRIGHTNESS = {
  // Normalização
  MAX_VALUE: 255,                    // [TECHNICAL] 8-bit max
  
  // Thresholds
  TOO_DARK_THRESHOLD: 0.2,           // [HEURISTIC] < 0.2 = muito escuro
  DARK_THRESHOLD: 0.3,               // [HEURISTIC] < 0.3 = escuro
  TOO_BRIGHT_THRESHOLD: 0.8,         // [HEURISTIC] > 0.8 = muito claro
  BRIGHT_THRESHOLD: 0.7,             // [HEURISTIC] > 0.7 = claro
  
  // Scores
  TOO_DARK_SCORE: 0.5,
  DARK_SCORE: 0.7,
  TOO_BRIGHT_SCORE: 0.6,
  BRIGHT_SCORE: 0.85,
  GOOD_SCORE: 1.0
}

/**
 * Pesos para cálculo de score geral
 * 
 * IMPORTANTE: Devem somar 1.0
 * Ajustados para OCR de SMS (textos pequenos críticos)
 * 
 * TODO: Validar com experimentos A/B
 */
export const WEIGHTS = {
  // Profile: SMS (default)
  SMS: {
    textReadability: 0.35,           // [PRIORITY] Crítico para textos pequenos
    sharpness: 0.30,                 // [PRIORITY] Muito importante
    contrast: 0.20,                  // [PRIORITY] Importante
    brightness: 0.10,                // [PRIORITY] Menos crítico
    resolution: 0.05                 // [PRIORITY] textReadability já cobre
  },
  
  // Profile: Document (mais conservador)
  DOCUMENT: {
    textReadability: 0.25,
    sharpness: 0.30,
    contrast: 0.25,
    brightness: 0.10,
    resolution: 0.10
  },
  
  // Profile: Fast (pula análises caras)
  FAST: {
    textReadability: 0.40,
    sharpness: 0.00,                 // Pula (caro)
    contrast: 0.30,
    brightness: 0.20,
    resolution: 0.10
  }
}

/**
 * Thresholds de decisão (quando preprocessar)
 * 
 * Baseados em correlação esperada com OCR confidence
 * TODO: Calibrar empiricamente
 */
export const DECISION_THRESHOLDS = {
  SMS: {
    overall: 0.70,                   // [HEURISTIC] Score geral mínimo
    textReadability: 0.60,           // [HEURISTIC] Crítico
    sharpness: 0.60,                 // [HEURISTIC] Crítico
    contrast: 0.50,                  // [HEURISTIC] Importante
    brightness: 0.40                 // [HEURISTIC] Menos crítico
  },
  
  DOCUMENT: {
    overall: 0.75,                   // Mais estrito
    textReadability: 0.65,
    sharpness: 0.65,
    contrast: 0.60,
    brightness: 0.45
  },
  
  FAST: {
    overall: 0.60,                   // Mais permissivo
    textReadability: 0.50,
    sharpness: 0.00,                 // Ignorado
    contrast: 0.45,
    brightness: 0.35
  }
}

/**
 * Prioridades (para ordenação de sugestões)
 */
export const PRIORITY = {
  CRITICAL: { level: 4, label: 'critical' },
  HIGH: { level: 3, label: 'high' },
  MEDIUM: { level: 2, label: 'medium' },
  LOW: { level: 1, label: 'low' },
  NONE: { level: 0, label: 'none' }
}

/**
 * Status de métricas individuais
 */
export const STATUS = {
  // Text readability
  TEXT: {
    UNREADABLE: 'unreadable',
    POOR: 'poor',
    MARGINAL: 'marginal',
    ACCEPTABLE: 'acceptable',
    GOOD: 'good',
    EXCELLENT: 'excellent'
  },
  
  // Sharpness
  SHARPNESS: {
    VERY_BLURRY: 'very_blurry',
    BLURRY: 'blurry',
    SOFT: 'soft',
    SHARP: 'sharp',
    VERY_SHARP: 'very_sharp'
  },
  
  // Contrast
  CONTRAST: {
    VERY_LOW: 'very_low',
    LOW: 'low',
    GOOD: 'good',
    HIGH: 'high'
  },
  
  // Brightness
  BRIGHTNESS: {
    TOO_DARK: 'too_dark',
    DARK: 'dark',
    GOOD: 'good',
    BRIGHT: 'bright',
    TOO_BRIGHT: 'too_bright'
  },
  
  // Resolution
  RESOLUTION: {
    POOR: 'poor',
    TOO_LOW_FOR_SMALL_TEXT: 'too_low_for_small_text',
    MARGINAL_FOR_SMALL_TEXT: 'marginal_for_small_text',
    ACCEPTABLE: 'acceptable',
    GOOD: 'good',
    EXCELLENT: 'excellent'
  }
}

/**
 * Validação: garantir que pesos somam 1.0
 */
export function validateWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  const tolerance = 0.001
  
  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(
      `Pesos devem somar 1.0 (atual: ${sum.toFixed(3)}). ` +
      `Valores: ${JSON.stringify(weights)}`
    )
  }
  
  return true
}

/**
 * Normalização automática de pesos
 */
export function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0)
  
  if (Math.abs(sum - 1.0) < 0.001) {
    return weights
  }
  
  const normalized = {}
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = value / sum
  }
  
  return normalized
}

/**
 * Helper: obter profile completo
 */
export function getProfile(profileName = 'SMS') {
  const profile = profileName.toUpperCase()
  
  if (!WEIGHTS[profile] || !DECISION_THRESHOLDS[profile]) {
    throw new Error(`Profile desconhecido: ${profileName}. Disponíveis: SMS, DOCUMENT, FAST`)
  }
  
  return {
    name: profile,
    weights: WEIGHTS[profile],
    thresholds: DECISION_THRESHOLDS[profile]
  }
}

export default {
  TEXT_SIZE,
  RESOLUTION,
  UPSCALE,
  SHARPNESS,
  CONTRAST,
  BRIGHTNESS,
  WEIGHTS,
  DECISION_THRESHOLDS,
  PRIORITY,
  STATUS,
  validateWeights,
  normalizeWeights,
  getProfile
}