import winston from 'winston'
import path from 'path'
import fs from 'fs'

const logsDir = path.join(__dirname, '../../logs')
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
}

const customFormart = winston.format.combine(
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

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
    ),
    transports: [
        // Erros em arquivo separado
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: customFormart
        }),
        // Todos os logs
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: customFormart
        })
    ]
})

// Console logging em ambiente de desenvolvimento
if(process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }))
}

// Atalhos
logger.success = (msg, meta) => logger.info(`✅${msg}`, meta)
logger.fail = (msg, meta) => logger.error(`❌${msg}`, meta)
logger.warnMsg = (msg, meta) => logger.warn(`⚠️${msg}`, meta)

export default logger