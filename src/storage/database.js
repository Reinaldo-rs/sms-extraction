import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

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
            this.db = new Database(this.dbPath)

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
        try {
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

            // Trigger para atualizar updated_at automaticamente
            db.exec(`
                CREATE TRIGGER IF NOT EXISTS update_timestamp 
                AFTER UPDATE ON extractions
                FOR EACH ROW
                BEGIN
                    UPDATE extractions SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id;
                END;
            `)

            console.log('✅ Tabelas criadas com sucesso')
        } catch (error) {
            console.error('❌ Erro ao criar tabelas:', error.message)
            throw error
        }
    }

    close() {
        try {
            if (this.db) {
                this.db.close()
                this.db = null
                console.log('✅ Banco de dados fechado')
            }
        } catch (error) {
            console.error('❌ Erro ao fechar banco de dados:', error.message)
            throw error
        }
    }

    // Método para testar conexão
    test() {
        try {
            const db = this.connect()
            const result = db.prepare('SELECT 1 as test').get()
            console.log('✅ Teste de conexão:', result)
            return result.test === 1
        } catch (error) {
            console.error('❌ Erro no teste de conexão:', error.message)
            return false
        }
    }

    // ========== MÉTODOS CRUD ==========

    /**
     * Insere uma nova extração no banco
     */
    insertExtraction(extraction) {
        try {
            const db = this.connect()

            const stmt = db.prepare(`
                INSERT INTO extractions (
                    id, filename, sender, date, messages_json,
                    confidence_overall, confidence_date, confidence_sender, confidence_messages,
                    processing_time_ms, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)

            const info = stmt.run(
                extraction.id,
                extraction.filename,
                extraction.sender,
                extraction.date,
                JSON.stringify(extraction.messages),
                extraction.confidence.overall,
                extraction.confidence.date,
                extraction.confidence.sender,
                extraction.confidence.messages,
                extraction.processingTime,
                extraction.status || 'processed'
            )

            console.log('✅ Extração inserida:', extraction.id)
            return info.changes > 0
        } catch (error) {
            console.error('❌ Erro ao inserir extração:', error.message)
            throw error
        }
    }

    /**
     * Busca extração por ID
     */
    getExtraction(id) {
        try {
            const db = this.connect()
            const stmt = db.prepare('SELECT * FROM extractions WHERE id = ?')
            const result = stmt.get(id)

            if (result) {
                // Parse JSON das mensagens
                result.messages = JSON.parse(result.messages_json)
                delete result.messages_json
            }

            return result
        } catch (error) {
            console.error('❌ Erro ao buscar extração:', error.message)
            throw error
        }
    }

    /**
     * Lista extrações com filtros
     */
    listExtractions(options = {}) {
        try {
            const db = this.connect()
            const { limit = 50, offset = 0, status, sender } = options

            let query = 'SELECT * FROM extractions WHERE 1=1'
            const params = []

            if (status) {
                query += ' AND status = ?'
                params.push(status)
            }

            if (sender) {
                query += ' AND sender LIKE ?'
                params.push(`%${sender}%`)
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
            params.push(limit, offset)

            const stmt = db.prepare(query)
            const results = stmt.all(...params)

            // Parse JSON das mensagens
            results.forEach(result => {
                result.messages = JSON.parse(result.messages_json)
                delete result.messages_json
            })

            return results
        } catch (error) {
            console.error('❌ Erro ao listar extrações:', error.message)
            throw error
        }
    }

    /**
     * Atualiza status de uma extração
     */
    updateStatus(id, newStatus) {
        try {
            const db = this.connect()
            const stmt = db.prepare('UPDATE extractions SET status = ? WHERE id = ?')
            const info = stmt.run(newStatus, id)

            console.log(`✅ Status atualizado: ${id} → ${newStatus}`)
            return info.changes > 0
        } catch (error) {
            console.error('❌ Erro ao atualizar status:', error.message)
            throw error
        }
    }

    /**
     * Deleta uma extração
     */
    deleteExtraction(id) {
        try {
            const db = this.connect()
            const stmt = db.prepare('DELETE FROM extractions WHERE id = ?')
            const info = stmt.run(id)

            console.log('✅ Extração deletada:', id)
            return info.changes > 0
        } catch (error) {
            console.error('❌ Erro ao deletar extração:', error.message)
            throw error
        }
    }

    /**
     * Conta total de extrações
     */
    countExtractions(status = null) {
        try {
            const db = this.connect()

            let query = 'SELECT COUNT(*) as total FROM extractions'
            const params = []

            if (status) {
                query += ' WHERE status = ?'
                params.push(status)
            }

            const stmt = db.prepare(query)
            const result = stmt.get(...params)

            return result.total
        } catch (error) {
            console.error('❌ Erro ao contar extrações:', error.message)
            throw error
        }
    }

    /**
     * Estatísticas gerais
     */
    getStats() {
        try {
            const db = this.connect()

            const stats = db.prepare(`
                SELECT 
                    COUNT(*) as total,
                    AVG(confidence_overall) as avg_confidence,
                    AVG(processing_time_ms) as avg_time,
                    SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
                    SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
                    SUM(CASE WHEN status = 'corrected' THEN 1 ELSE 0 END) as corrected,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error
                FROM extractions
            `).get()

            return stats
        } catch (error) {
            console.error('❌ Erro ao buscar estatísticas:', error.message)
            throw error
        }
    }
}

export default DatabaseManager