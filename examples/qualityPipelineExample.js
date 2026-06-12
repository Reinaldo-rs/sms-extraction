import QualityAnalyzer from './QualityAnalyzer.js'
import QualityPolicy from './QualityPolicy.js'
import sharp from 'sharp'
import fs from 'fs'

/**
 * Exemplo de uso da arquitetura separada
 * 
 * Demonstra:
 * 1. QualityAnalyzer - métricas puras
 * 2. QualityPolicy - decisões baseadas em métricas
 * 3. Como integrar com preprocessor
 */

async function exemploCompleto(imagePath) {
  console.log('🎯 EXEMPLO: Arquitetura Separada\n')
  console.log('='.repeat(70))
  
  // ============================================================
  // ETAPA 1: ANÁLISE (apenas métricas)
  // ============================================================
  
  console.log('\n📊 ETAPA 1: Análise de Qualidade')
  console.log('-'.repeat(70))
  
  const analyzer = new QualityAnalyzer({ enableLogs: true })
  const analysis = await analyzer.analyze(imagePath)
  
  // Output: apenas dados estruturados, zero decisões
  console.log('\n📋 Métricas obtidas:')
  console.log(JSON.stringify({
    textReadability: {
      score: analysis.metrics.textReadability.score,
      status: analysis.metrics.textReadability.status,
      estimatedMinTextPx: analysis.metrics.textReadability.estimatedMinTextPx
    },
    sharpness: {
      score: analysis.metrics.sharpness.score,
      status: analysis.metrics.sharpness.status,
      variance: analysis.metrics.sharpness.variance
    },
    contrast: {
      score: analysis.metrics.contrast.score,
      status: analysis.metrics.contrast.status
    },
    brightness: {
      score: analysis.metrics.brightness.score,
      status: analysis.metrics.brightness.status
    }
  }, null, 2))
  
  // ============================================================
  // ETAPA 2: DECISÃO (aplicar política)
  // ============================================================
  
  console.log('\n\n🧠 ETAPA 2: Aplicação de Política')
  console.log('-'.repeat(70))
  
  // Pode usar diferentes perfis
  const policy = new QualityPolicy({ 
    profile: 'SMS',
    enableLogs: true 
  })
  
  const decisions = policy.evaluate(analysis)
  
  // Output: decisões estruturadas
  console.log(policy.explain(decisions))
  
  // ============================================================
  // ETAPA 3: EXECUÇÃO (aplicar ações)
  // ============================================================
  
  console.log('\n\n⚙️  ETAPA 3: Execução de Ações')
  console.log('-'.repeat(70))
  
  if (!decisions.needsPreprocessing) {
    console.log('✅ Imagem já está boa, nenhuma ação necessária')
    return
  }
  
  // Construir pipeline Sharp baseado nas ações
  let imageBuffer = fs.readFileSync(imagePath)
  let pipeline = sharp(imageBuffer)
  
  for (const action of decisions.actions) {
    console.log(`\n🔧 Aplicando: ${action.type} (${action.priority.label})`)
    console.log(`   ${action.reason}`)
    
    switch (action.type) {
      case 'upscale':
        console.log(`   Escala: ${action.params.scaleFactor}x`)
        console.log(`   Dimensões: → ${action.params.targetWidth}x${action.params.targetHeight}`)
        console.log(`   Método: ${action.params.method}`)
        
        pipeline = pipeline.resize({
          width: action.params.targetWidth,
          height: action.params.targetHeight,
          kernel: action.params.method,
          fit: 'fill'
        })
        break
        
      case 'sharpen':
        console.log(`   Sigma: ${action.params.sigma}`)
        
        pipeline = pipeline.sharpen({
          sigma: action.params.sigma
        })
        break
        
      case 'contrast':
        console.log(`   Método: ${action.params.method}`)
        
        if (action.params.method === 'normalize') {
          pipeline = pipeline.normalize()
        } else if (action.params.method === 'clahe') {
          // CLAHE não disponível nativamente no Sharp
          // Usar normalize como fallback
          pipeline = pipeline.normalize()
        }
        break
        
      case 'brightness':
        console.log(`   Ajuste: ${(action.params.adjustment * 100).toFixed(1)}%`)
        
        const modifier = 1 + action.params.adjustment
        pipeline = pipeline.modulate({
          brightness: modifier
        })
        break
    }
  }
  
  // Executar pipeline
  console.log('\n⚡ Executando pipeline...')
  const processedBuffer = await pipeline.toBuffer()
  
  // Salvar resultado
  const outputPath = imagePath.replace(/\.([^.]+)$/, '_processed.$1')
  await sharp(processedBuffer).toFile(outputPath)
  
  console.log(`\n✅ Imagem processada salva: ${outputPath}`)
  
  // ============================================================
  // ETAPA 4: VALIDAÇÃO (opcional - analisar resultado)
  // ============================================================
  
  console.log('\n\n📊 ETAPA 4: Validação do Resultado')
  console.log('-'.repeat(70))
  
  const afterAnalysis = await analyzer.analyze(processedBuffer)
  const afterDecisions = policy.evaluate(afterAnalysis)
  
  console.log('\n📈 Comparação:')
  console.log(`Score antes: ${(decisions.overallScore * 100).toFixed(1)}% (${decisions.grade})`)
  console.log(`Score depois: ${(afterDecisions.overallScore * 100).toFixed(1)}% (${afterDecisions.grade})`)
  console.log(`Melhoria: ${((afterDecisions.overallScore - decisions.overallScore) * 100).toFixed(1)}%`)
  
  if (afterDecisions.needsPreprocessing) {
    console.log('\n⚠️  Ainda precisa de mais preprocessamento')
    console.log(policy.explain(afterDecisions))
  } else {
    console.log('\n✅ Imagem agora está adequada para OCR!')
  }
  
  console.log('\n' + '='.repeat(70))
}

/**
 * Exemplo: Comparar diferentes perfis
 */
async function exemploCompararPerfis(imagePath) {
  console.log('\n🔍 EXEMPLO: Comparar Perfis\n')
  
  const analyzer = new QualityAnalyzer()
  const analysis = await analyzer.analyze(imagePath)
  
  const perfis = ['SMS', 'DOCUMENT', 'FAST']
  
  console.log('Mesma imagem, diferentes políticas:\n')
  
  for (const perfil of perfis) {
    const policy = new QualityPolicy({ profile: perfil })
    const decisions = policy.evaluate(analysis)
    
    console.log(`\n${perfil}:`)
    console.log(`  Score: ${(decisions.overallScore * 100).toFixed(1)}%`)
    console.log(`  Preprocessar: ${decisions.needsPreprocessing ? 'SIM' : 'NÃO'}`)
    console.log(`  Ações: ${decisions.actions.length}`)
  }
}

/**
 * Exemplo: Customizar thresholds
 */
async function exemploCustomThresholds(imagePath) {
  console.log('\n⚙️  EXEMPLO: Thresholds Customizados\n')
  
  const analyzer = new QualityAnalyzer()
  const analysis = await analyzer.analyze(imagePath)
  
  // Política padrão
  const policyDefault = new QualityPolicy({ profile: 'SMS' })
  const decisionsDefault = policyDefault.evaluate(analysis)
  
  // Política estrita (thresholds mais altos)
  const policyStrict = new QualityPolicy({ 
    profile: 'SMS',
    thresholds: {
      overall: 0.80,              // Mais exigente
      textReadability: 0.70,
      sharpness: 0.70,
      contrast: 0.60,
      brightness: 0.50
    }
  })
  const decisionsStrict = policyStrict.evaluate(analysis)
  
  // Política permissiva (thresholds mais baixos)
  const policyLenient = new QualityPolicy({ 
    profile: 'SMS',
    thresholds: {
      overall: 0.60,              // Mais permissivo
      textReadability: 0.50,
      sharpness: 0.50,
      contrast: 0.40,
      brightness: 0.30
    }
  })
  const decisionsLenient = policyLenient.evaluate(analysis)
  
  console.log('Comparação de políticas:')
  console.log(`\nPadrão (threshold=0.70):`)
  console.log(`  Preprocessar: ${decisionsDefault.needsPreprocessing ? 'SIM' : 'NÃO'}`)
  console.log(`  Ações: ${decisionsDefault.actions.length}`)
  
  console.log(`\nEstrita (threshold=0.80):`)
  console.log(`  Preprocessar: ${decisionsStrict.needsPreprocessing ? 'SIM' : 'NÃO'}`)
  console.log(`  Ações: ${decisionsStrict.actions.length}`)
  
  console.log(`\nPermissiva (threshold=0.60):`)
  console.log(`  Preprocessar: ${decisionsLenient.needsPreprocessing ? 'SIM' : 'NÃO'}`)
  console.log(`  Ações: ${decisionsLenient.actions.length}`)
}

/**
 * Exemplo: Usar em batch
 */
async function exemploBatch(imagePaths) {
  console.log('\n📦 EXEMPLO: Processamento em Batch\n')
  
  const analyzer = new QualityAnalyzer()
  const policy = new QualityPolicy({ profile: 'SMS' })
  
  const results = []
  
  for (const imagePath of imagePaths) {
    const analysis = await analyzer.analyze(imagePath)
    const decisions = policy.evaluate(analysis)
    
    results.push({
      path: imagePath,
      score: decisions.overallScore,
      needsPreprocessing: decisions.needsPreprocessing,
      actionCount: decisions.actions.length
    })
  }
  
  // Estatísticas
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
  const needsPreprocessCount = results.filter(r => r.needsPreprocessing).length
  
  console.log(`Processadas: ${results.length} imagens`)
  console.log(`Score médio: ${(avgScore * 100).toFixed(1)}%`)
  console.log(`Precisam preprocessamento: ${needsPreprocessCount} (${(needsPreprocessCount / results.length * 100).toFixed(1)}%)`)
  
  // Imagens com score mais baixo
  console.log(`\nImagens problemáticas (score < 70%):`)
  results
    .filter(r => r.score < 0.7)
    .sort((a, b) => a.score - b.score)
    .forEach(r => {
      console.log(`  ${r.path}: ${(r.score * 100).toFixed(1)}% (${r.actionCount} ações)`)
    })
}

// ============================================================
// Executar exemplos
// ============================================================

const imagePath = process.argv[2]

if (!imagePath || !fs.existsSync(imagePath)) {
  console.log('❌ Uso: node exemplo-uso.js <caminho-da-imagem>')
  console.log('\n💡 Este script demonstra a arquitetura separada:')
  console.log('   1. QualityAnalyzer - métricas puras')
  console.log('   2. QualityPolicy - decisões baseadas em métricas')
  console.log('   3. Como integrar com preprocessor\n')
  process.exit(1)
}

// Executar exemplo principal
exemploCompleto(imagePath)
  .then(() => exemploCompararPerfis(imagePath))
  .then(() => exemploCustomThresholds(imagePath))
  .catch(error => {
    console.error('\n❌ Erro:', error.message)
    process.exit(1)
  })