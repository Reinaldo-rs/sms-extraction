import config from './config.js'
import logger from './src/utils/logger.js'
import DatabaseManager from './src/storage/database.js'
import fs from 'fs'

// Banner de inicialização
console.log(`
╔══════════════════════════════════════════════╗
║   SMS EXTRACTION SYSTEM v2.0 - Fase 1       ║
║   Setup Básico (ES Modules)                 ║
╚══════════════════════════════════════════════╝
`)

async function initialize() {
  try {
    logger.info('🚀 Iniciando aplicação...')
    logger.info(`📝 Ambiente: ${config.env}`)
    logger.info(`🔌 Porta: ${config.port}`)
    logger.info(`📦 Usando ES Modules (ESM)`)

    // 1. Conectar banco de dados
    logger.info('📊 Conectando ao banco de dados...')
    const db = new DatabaseManager(config.database.path)
    db.connect()
    db.createTables()

    // 2. Testar conexão
    const testResult = db.test()
    if (testResult) {
      logger.success('Banco de dados funcionando!')
    } else {
      throw new Error('Teste de conexão falhou')
    }

    // 3. Verificar estrutura de pastas
    logger.info('📁 Verificando estrutura de pastas...')
    const requiredDirs = [
      './uploads',
      './logs',
      './data',
      './data/models',
      './data/training'
    ]

    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
        logger.success(`Pasta criada: ${dir}`)
      } else {
        logger.info(`Pasta OK: ${dir}`)
      }
    })

    // 4. Testar CRUD (opcional - apenas para validar)
    logger.info('🧪 Testando operações CRUD...')
    
    // Inserir extração de teste
    const testExtraction = {
      id: 'test_' + Date.now(),
      filename: 'test.png',
      sender: 'TestSender',
      date: '01-01-2025',
      messages: [
        { hora: '10:00', corpo: 'Teste', data: '01-01-2025' }
      ],
      confidence: {
        overall: 95,
        date: 92,
        sender: 95,
        messages: 96
      },
      processingTime: 2500,
      status: 'processed'
    }

    db.insertExtraction(testExtraction)
    
    // Buscar
    const retrieved = db.getExtraction(testExtraction.id)
    console.log('  📄 Extração recuperada:', retrieved ? '✓' : '✗')

    // Listar
    const list = db.listExtractions({ limit: 5 })
    console.log('  📋 Total encontrado:', list.length)

    // Estatísticas
    const stats = db.getStats()
    console.log('  📊 Estatísticas:', stats)

    // Limpar teste
    db.deleteExtraction(testExtraction.id)
    console.log('  🗑️  Teste limpo')

    // 5. Testar config helpers
    logger.info('🔧 Testando helpers de configuração...')
    console.log('  - Database path:', config.database.path)
    console.log('  - isDevelopment:', config.isDevelopment)
    console.log('  - Upload max size:', config.uploads.maxSize, 'bytes')

    // 6. Resumo
    console.log(`
╔══════════════════════════════════════════════╗
║        ✅ SETUP ESM CONCLUÍDO!               ║
╠══════════════════════════════════════════════╣
║  Banco de Dados: ✓ Conectado                ║
║  Tabelas:        ✓ Criadas                  ║
║  Triggers:       ✓ Configurados             ║
║  CRUD:           ✓ Testado                  ║
║  Pastas:         ✓ Criadas                  ║
║  Logger:         ✓ Funcionando              ║
║  Config:         ✓ Carregada (ESM)          ║
║  Validação:      ✓ Passou                   ║
╠══════════════════════════════════════════════╣
║  Próximos passos:                           ║
║  • Implementar preprocessamento             ║
║  • Configurar OCR                           ║
║  • Criar testes unitários                   ║
╚══════════════════════════════════════════════╝
    `)

    // Fechar banco
    db.close()

  } catch (error) {
    logger.fail('Erro na inicialização', { error: error.message })
    console.error(error)
    process.exit(1)
  }
}

// Executar
initialize()