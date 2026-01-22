import winston from 'winston'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Garante que pasta logs existe
const logsDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
}

// Formato customizado
const customFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`
        if (stack) {
            log += `\n${stack}`
        }
        return log
    })
)

// Criar logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        // Erros em arquivo separado
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: customFormat
        }),
        // Todos os logs
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: customFormat
        })
    ]
})

// Console em desenvolvimento
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }))
}

// Atalhos úteis
logger.success = (message, meta) => logger.info(`✅ ${message}`, meta)
logger.fail = (message, meta) => logger.error(`❌ ${message}`, meta)
logger.warning = (message, meta) => logger.warn(`⚠️  ${message}`, meta)

export default logger