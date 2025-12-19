import {config as loadEnv} from 'dotenv'
import {fileURLToPath} from 'url'
import {dirname, join} from 'path'

// Carregar variáveis de ambiente do .env
loadEnv()

// Para compatibilidade com __dirname em módulos ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Validação de variáveis de ambiente obrigatórias
const requiredEnvVars = []
const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missingVars.join(', ')}`)
}

const config = {
    // Ambient
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',

    //Banco de dados
    database: {
        path: process.env.DATABASE_PATH || join(__dirname, 'data', 'extraction.db'),
        // Opções adicionais do SQLite
        options: {
            busyTimeout: 50000, // 50 segundos
            verbose: process.env.NODE_ENV === 'development'
        }
    },

    // Redis
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        enabled: process.env.REDIS_ENABLED === 'true',
        // Configurações de retry
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000)
            return delay
        },
        maxRetriesPerRequest: 3
    },

    // OCR
    ocr: {
        engines: ['tesseract'], // Fase 1 apenas tesseract
        tesseract: {
            lang: 'por',
            psm: 6,
            timeout: 30000,
            // Configurações avançadas
            options: {
                tessedit_char_whitelist: '',
                preserve_interword_spaces: '1'
            }
        }
    },

    uploads: {
        path: process.env.UPLOADS_PATH || join(__dirname, 'uploads'),
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10), // 10 MB em bytes
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
        // Validações adicionais
        maxFiles: 10,
        fieldName: 'file'
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: join(__dirname, '..', 'logs', 'combined.log'),
        errorFile: join(__dirname, '..', 'logs', 'error.log'),
        // Rotação de logs
        maxSize: '20m',
        maxFiles: '14d',
        format: process.env.LOG_FORMAT || 'json'
    },

}

export default config