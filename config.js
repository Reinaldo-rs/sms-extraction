import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

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

// Configuração centralizada
const config = {
    // Ambiente
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
    isProduction: process.env.NODE_ENV === 'production',

    // Banco de dados
    database: {
        path: process.env.DATABASE_PATH || join(__dirname, 'data', 'extractions.db'),
        options: {
            busyTimeout: 5000,
            verbose: process.env.NODE_ENV === 'development'
        }
    },

    // Redis
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        enabled: process.env.REDIS_ENABLED === 'true',
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3
    },

    // OCR
    ocr: {
        engines: ['tesseract'], // Fase 1: apenas Tesseract
        tesseract: {
            lang: 'por',
            psm: 6,
            timeout: 30000,
            options: {
                tessedit_char_whitelist: '',
                preserve_interword_spaces: '1'
            }
        }
    },

    // Uploads
    uploads: {
        path: process.env.UPLOAD_PATH || join(__dirname, 'uploads'),
        maxSize: parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10), // 10MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
        maxFiles: 10,
        fieldName: 'file'
    },

    // Logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        file: join(__dirname, 'logs', 'combined.log'),
        errorFile: join(__dirname, 'logs', 'error.log'),
        maxSize: '20m',
        maxFiles: '14d',
        format: process.env.LOG_FORMAT || 'json'
    },

    // Rate Limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutos
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
        message: 'Muitas requisições deste IP, tente novamente mais tarde.'
    },

    // CORS
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
        optionsSuccessStatus: 200
    },

    // API
    api: {
        prefix: '/api/v1',
        timeout: 30000,
        defaultPageSize: 20,
        maxPageSize: 100
    }
}

// Função helper para obter configurações específicas
export const getConfig = (path) => {
    return path.split('.').reduce((obj, key) => obj?.[key], config);
};

// Função para validar configuração
export const validateConfig = () => {
    const errors = [];

    if (config.port < 1 || config.port > 65535) {
        errors.push('Porta inválida: deve estar entre 1 e 65535');
    }

    if (config.uploads.maxSize < 0) {
        errors.push('Tamanho máximo de upload inválido');
    }

    if (config.database.options.busyTimeout < 0) {
        errors.push('busyTimeout inválido');
    }

    if (errors.length > 0) {
        throw new Error(`Erros de configuração:\n- ${errors.join('\n- ')}`);
    }

    return true;
};

// Validar ao carregar
try {
    validateConfig();
    console.log('✅ Configuração validada com sucesso');
} catch (error) {
    console.error('❌ Erro na configuração:', error.message);
    process.exit(1);
}

// Export default
export default config;