import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { connect } from 'http2'

class DatabaseManager {
    constructor(dbPath = './data/extractions.db') {
        this.dbPath = dbPath
        this.db = null

        // Garante que o diretório existe antes de criar o banco de dados
        const dataDir = path.dirname(dbPath)
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true })
        }
    }

    connect() {
        if (this.db) {
            return this.db
        }

        try {
            this.db = new DatabaseManager(this.dbPath)

            // Configurações de performance
            this.db.pragma('journal_mode = WAL')
            this.db.pragma('synchronous = NORMAL')
            this.db.pragma('cache_size = -64000') // 64MB cache
            this.db.pragma('temp_store = MEMORY')

            console.log('✅ Banco de dados conectado:', this.dbPath)

            return this.db
        } catch (error) {
            console.error('❌ Erro ao conectar banco de dados:', error.message)
            throw error
        }
    }

    createTables() {
        const db = this.connect()

        // Tabela principal de extrações
        db.exec(`
      CREATE TABLE IF NOT EXISTS extractions (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        sender TEXT,
        date TEXT,
        messages_json TEXT,
        confidence_overall REAL,
        confidence_date REAL,
        confidence_sender REAL,
        confidence_messages REAL,
        processing_time_ms INTEGER,
        status TEXT CHECK(status IN ('processed', 'review', 'corrected', 'error')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME
      )
    `)

        // Índices
        db.exec(`
      CREATE INDEX IF NOT EXISTS idx_extractions_sender ON extractions(sender);
      CREATE INDEX IF NOT EXISTS idx_extractions_date ON extractions(date);
      CREATE INDEX IF NOT EXISTS idx_extractions_status ON extractions(status);
      CREATE INDEX IF NOT EXISTS idx_extractions_confidence ON extractions(confidence_overall);
    `)

        console.log('✅ Tabelas criadas com sucesso')
    }

    close() {
        if (this.db) {
            this.db.close()
            console.log('✅ Banco de dados fechado')
        }
    }

    // Método para testar conexão
    test() {
        const db = this.connect()
        const result = db.prepare('SELECT 1 as test').get()
        console.log('✅ Teste de conexão:', result)
        return result.test === 1
    }
}

module.exports = DatabaseManager