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
}