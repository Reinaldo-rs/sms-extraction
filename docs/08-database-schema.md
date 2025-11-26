# 08 - Database Schema (Esquema do Banco de Dados)

> **Navegação:** [← API Reference](07-api-reference.md) | [Deployment →](09-deployment.md)

---

## 📑 Índice

1. [Visão Geral](#visão-geral)
2. [Tabelas](#tabelas)
3. [Índices](#índices)
4. [Queries Comuns](#queries-comuns)
5. [Migrations](#migrations)
6. [Backup e Restore](#backup-e-restore)

---

## 🎯 Visão Geral

### Tecnologia
- **SQLite 3** - Banco principal
- **Redis** - Cache e sessões

### Estrutura
```
data/
├── extractions.db        # Banco principal
├── extractions.db-wal    # Write-Ahead Log
└── extractions.db-shm    # Shared Memory
```

### Diagrama ER

```
┌──────────────┐       ┌──────────────┐
│  extractions │──────<│   messages   │
└──────┬───────┘       └──────────────┘
       │
       │ 1:N
       │
┌──────▼───────┐       ┌──────────────┐
│  corrections │       │   metrics    │
└──────────────┘       └──────────────┘
```

---

## 📊 Tabelas

### 1. extractions

Tabela principal com dados extraídos.

```sql
CREATE TABLE extractions (
  -- Identificação
  id TEXT PRIMARY KEY,                    -- Nome do arquivo
  filename TEXT NOT NULL,                 -- Path completo
  
  -- Dados extraídos
  sender TEXT,                            -- Remetente
  date TEXT,                              -- Data (MM-DD-YYYY)
  messages_json TEXT,                     -- JSON com mensagens
  
  -- Confiança
  confidence_overall REAL,                -- 0-100
  confidence_date REAL,
  confidence_sender REAL,
  confidence_messages REAL,
  
  -- Metadata
  processing_time_ms INTEGER,
  ocr_engine TEXT,
  extraction_methods_json TEXT,           -- JSON
  preprocessing_applied_json TEXT,        -- JSON
  
  -- Validação
  validation_issues_json TEXT,            -- JSON
  status TEXT CHECK(status IN (
    'processed',
    'review',
    'corrected',
    'error'
  )),
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  processed_by TEXT
);
```

#### Exemplo de Registro

```sql
INSERT INTO extractions VALUES (
  'Screenshot_20250609-031245.png',
  '/uploads/Screenshot_20250609-031245.png',
  'BancoInter',
  '06-09-2025',
  '[{"hora":"09:30","corpo":"Seu pagamento foi aprovado","data":"06-09-2025","confidence":0.96}]',
  95.0,
  92.0,
  95.0,
  96.0,
  2450,
  'consensus',
  '{"date":"banner_detection","sender":"layout_pattern"}',
  '["rotation_correction","contrast_enhancement"]',
  '[]',
  'processed',
  '2025-06-15 10:30:00',
  NULL,
  'system'
);
```

---

### 2. messages

Tabela normalizada de mensagens (opcional, para queries mais rápidas).

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extraction_id TEXT NOT NULL,
  
  -- Dados da mensagem
  hora TEXT NOT NULL,
  corpo TEXT NOT NULL,
  data TEXT NOT NULL,
  confidence REAL,
  
  -- Metadata
  position INTEGER,                       -- Ordem na conversa
  
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);
```

#### Trigger para Popular

```sql
CREATE TRIGGER after_extraction_insert
AFTER INSERT ON extractions
FOR EACH ROW
BEGIN
  INSERT INTO messages (extraction_id, hora, corpo, data, confidence, position)
  SELECT 
    NEW.id,
    json_extract(value, '$.hora'),
    json_extract(value, '$.corpo'),
    json_extract(value, '$.data'),
    json_extract(value, '$.confidence'),
    key
  FROM json_each(NEW.messages_json);
END;
```

---

### 3. corrections

Armazena correções humanas para feedback loop.

```sql
CREATE TABLE corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extraction_id TEXT NOT NULL,
  
  -- Correção
  field TEXT NOT NULL,                    -- Campo corrigido
  original_value TEXT,
  corrected_value TEXT NOT NULL,
  
  -- Auditoria
  corrected_by TEXT,
  corrected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE CASCADE
);
```

#### Exemplo

```sql
INSERT INTO corrections (extraction_id, field, original_value, corrected_value, corrected_by)
VALUES (
  'Screenshot_20250609-031245.png',
  'sender',
  'BancoInter',
  'Banco Inter',
  'user@example.com'
);
```

---

### 4. metrics

Métricas agregadas por dia.

```sql
CREATE TABLE metrics (
  date DATE PRIMARY KEY,
  
  -- Contadores
  total_processed INTEGER DEFAULT 0,
  total_success INTEGER DEFAULT 0,
  total_review INTEGER DEFAULT 0,
  total_error INTEGER DEFAULT 0,
  
  -- Médias
  avg_confidence REAL,
  avg_processing_time REAL,
  
  -- Breakdown
  excellent_count INTEGER DEFAULT 0,      -- >= 95%
  good_count INTEGER DEFAULT 0,           -- 85-94%
  acceptable_count INTEGER DEFAULT 0,     -- 70-84%
  low_count INTEGER DEFAULT 0,            -- < 70%
  
  -- Atualização
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Trigger para Atualizar Métricas

```sql
CREATE TRIGGER after_extraction_complete
AFTER INSERT ON extractions
FOR EACH ROW
WHEN NEW.status = 'processed'
BEGIN
  INSERT INTO metrics (date, total_processed)
  VALUES (DATE(NEW.created_at), 1)
  ON CONFLICT(date) DO UPDATE SET
    total_processed = total_processed + 1,
    total_success = total_success + CASE WHEN NEW.confidence_overall >= 85 THEN 1 ELSE 0 END,
    avg_confidence = (avg_confidence * total_processed + NEW.confidence_overall) / (total_processed + 1),
    avg_processing_time = (avg_processing_time * total_processed + NEW.processing_time_ms) / (total_processed + 1),
    excellent_count = excellent_count + CASE WHEN NEW.confidence_overall >= 95 THEN 1 ELSE 0 END,
    good_count = good_count + CASE WHEN NEW.confidence_overall >= 85 AND NEW.confidence_overall < 95 THEN 1 ELSE 0 END,
    acceptable_count = acceptable_count + CASE WHEN NEW.confidence_overall >= 70 AND NEW.confidence_overall < 85 THEN 1 ELSE 0 END,
    low_count = low_count + CASE WHEN NEW.confidence_overall < 70 THEN 1 ELSE 0 END,
    updated_at = CURRENT_TIMESTAMP;
END;
```

---

### 5. ml_predictions

Armazena predições do ML para análise.

```sql
CREATE TABLE ml_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extraction_id TEXT,
  
  -- Predição
  model TEXT NOT NULL,                    -- 'date_predictor', 'layout_classifier'
  prediction TEXT NOT NULL,
  actual TEXT,
  confidence REAL,
  is_correct INTEGER,                     -- 0 ou 1
  
  -- Timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (extraction_id) REFERENCES extractions(id) ON DELETE SET NULL
);
```

---

### 6. alerts

Log de alertas do sistema.

```sql
CREATE TABLE alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Alerta
  type TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('INFO', 'WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  details_json TEXT,
  
  -- Status
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'resolved', 'ignored')),
  resolved_at DATETIME,
  resolved_by TEXT,
  
  -- Timestamp
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔍 Índices

### Índices Primários

```sql
-- extractions
CREATE INDEX idx_extractions_sender ON extractions(sender);
CREATE INDEX idx_extractions_date ON extractions(date);
CREATE INDEX idx_extractions_status ON extractions(status);
CREATE INDEX idx_extractions_confidence ON extractions(confidence_overall);
CREATE INDEX idx_extractions_created_at ON extractions(created_at);

-- Índice composto para queries comuns
CREATE INDEX idx_extractions_status_confidence 
  ON extractions(status, confidence_overall);

CREATE INDEX idx_extractions_sender_date 
  ON extractions(sender, date);

CREATE INDEX idx_extractions_created_status 
  ON extractions(created_at DESC, status);

-- messages
CREATE INDEX idx_messages_extraction_id ON messages(extraction_id);
CREATE INDEX idx_messages_data ON messages(data);

-- corrections
CREATE INDEX idx_corrections_extraction_id ON corrections(extraction_id);
CREATE INDEX idx_corrections_corrected_at ON corrections(corrected_at);

-- ml_predictions
CREATE INDEX idx_ml_predictions_model ON ml_predictions(model);
CREATE INDEX idx_ml_predictions_created_at ON ml_predictions(created_at);

-- alerts
CREATE INDEX idx_alerts_severity_status ON alerts(severity, status);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);
```

---

## 📝 Queries Comuns

### 1. Buscar Extrações por Remetente

```sql
SELECT 
  id,
  sender,
  date,
  json_array_length(messages_json) as message_count,
  confidence_overall,
  created_at
FROM extractions
WHERE sender LIKE '%Banco%'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Extrações que Precisam de Revisão

```sql
SELECT 
  id,
  sender,
  date,
  confidence_overall,
  validation_issues_json
FROM extractions
WHERE status = 'review'
  OR confidence_overall < 85
ORDER BY confidence_overall ASC;
```

### 3. Estatísticas por Período

```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total,
  AVG(confidence_overall) as avg_confidence,
  SUM(CASE WHEN confidence_overall >= 85 THEN 1 ELSE 0 END) as auto_approved,
  SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as needs_review
FROM extractions
WHERE created_at >= datetime('now', '-7 days')
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 4. Top Remetentes

```sql
SELECT 
  sender,
  COUNT(*) as count,
  AVG(confidence_overall) as avg_confidence
FROM extractions
WHERE created_at >= datetime('now', '-30 days')
GROUP BY sender
ORDER BY count DESC
LIMIT 10;
```

### 5. Performance do OCR

```sql
SELECT 
  ocr_engine,
  COUNT(*) as total,
  AVG(confidence_overall) as avg_confidence,
  AVG(processing_time_ms) as avg_time
FROM extractions
WHERE created_at >= datetime('now', '-7 days')
GROUP BY ocr_engine;
```

### 6. Acurácia do ML

```sql
SELECT 
  model,
  COUNT(*) as total_predictions,
  SUM(is_correct) as correct_predictions,
  ROUND(100.0 * SUM(is_correct) / COUNT(*), 2) as accuracy,
  AVG(confidence) as avg_confidence
FROM ml_predictions
WHERE created_at >= datetime('now', '-30 days')
  AND actual IS NOT NULL
GROUP BY model;
```

### 7. Busca Full-Text em Mensagens

```sql
-- Busca mensagens que contêm termo
SELECT 
  e.id,
  e.sender,
  e.date,
  m.corpo
FROM extractions e
JOIN messages m ON m.extraction_id = e.id
WHERE m.corpo LIKE '%aprovado%'
ORDER BY e.created_at DESC;
```

### 8. Análise de Erros

```sql
SELECT 
  json_extract(validation_issues_json, '$[0].type') as issue_type,
  COUNT(*) as occurrences
FROM extractions
WHERE validation_issues_json != '[]'
  AND created_at >= datetime('now', '-7 days')
GROUP BY issue_type
ORDER BY occurrences DESC;
```

---

## 🔄 Migrations

### Sistema de Migração

```javascript
// src/storage/migrations.js
const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE extractions (...);
        CREATE TABLE messages (...);
        CREATE INDEX ...;
      `);
    },
    down: async (db) => {
      await db.exec(`
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS extractions;
      `);
    }
  },
  {
    version: 2,
    name: 'add_ml_predictions',
    up: async (db) => {
      await db.exec(`
        CREATE TABLE ml_predictions (...);
        CREATE INDEX idx_ml_predictions_model ON ml_predictions(model);
      `);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS ml_predictions;`);
    }
  }
];

class MigrationRunner {
  constructor(db) {
    this.db = db;
  }

  async getCurrentVersion() {
    try {
      const row = await this.db.get('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1');
      return row ? row.version : 0;
    } catch {
      // Tabela não existe, criar
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          name TEXT,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return 0;
    }
  }

  async migrate() {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = migrations.filter(m => m.version > currentVersion);

    if (pendingMigrations.length === 0) {
      console.log('Database is up to date');
      return;
    }

    console.log(`Running ${pendingMigrations.length} migrations...`);

    for (const migration of pendingMigrations) {
      console.log(`Applying migration ${migration.version}: ${migration.name}`);
      
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        await migration.up(this.db);
        
        await this.db.run(
          'INSERT INTO schema_version (version, name) VALUES (?, ?)',
          [migration.version, migration.name]
        );
        
        await this.db.run('COMMIT');
        
        console.log(`✓ Migration ${migration.version} applied`);
      } catch (error) {
        await this.db.run('ROLLBACK');
        console.error(`✗ Migration ${migration.version} failed:`, error);
        throw error;
      }
    }

    console.log('All migrations completed');
  }

  async rollback(targetVersion) {
    const currentVersion = await this.getCurrentVersion();
    const migrationsToRollback = migrations
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .reverse();

    for (const migration of migrationsToRollback) {
      console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
      
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        await migration.down(this.db);
        
        await this.db.run(
          'DELETE FROM schema_version WHERE version = ?',
          [migration.version]
        );
        
        await this.db.run('COMMIT');
        
        console.log(`✓ Migration ${migration.version} rolled back`);
      } catch (error) {
        await this.db.run('ROLLBACK');
        console.error(`✗ Rollback ${migration.version} failed:`, error);
        throw error;
      }
    }
  }
}

module.exports = MigrationRunner;
```

### Executar Migração

```bash
# Via CLI
node scripts/migrate.js

# Via código
const MigrationRunner = require('./src/storage/migrations');
const db = require('./src/storage/database');

const runner = new MigrationRunner(db);
await runner.migrate();
```

---

## 💾 Backup e Restore

### Backup Automático

```javascript
// src/storage/backup.js
const fs = require('fs');
const path = require('path');

class BackupManager {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.backupDir = './backups';
  }

  async createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(
      this.backupDir,
      `extractions_${timestamp}.db`
    );

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Copia arquivo
    fs.copyFileSync(this.dbPath, backupPath);

    // Comprime (opcional)
    const zlib = require('zlib');
    const gzip = zlib.createGzip();
    const source = fs.createReadStream(backupPath);
    const destination = fs.createWriteStream(backupPath + '.gz');

    await new Promise((resolve, reject) => {
      source.pipe(gzip).pipe(destination)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Remove arquivo não comprimido
    fs.unlinkSync(backupPath);

    console.log(`Backup created: ${backupPath}.gz`);

    return backupPath + '.gz';
  }

  async restore(backupPath) {
    console.log(`Restoring from ${backupPath}...`);

    // Descomprime se necessário
    if (backupPath.endsWith('.gz')) {
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      const tempPath = backupPath.replace('.gz', '');

      const source = fs.createReadStream(backupPath);
      const destination = fs.createWriteStream(tempPath);

      await new Promise((resolve, reject) => {
        source.pipe(gunzip).pipe(destination)
          .on('finish', resolve)
          .on('error', reject);
      });

      backupPath = tempPath;
    }

    // Backup do arquivo atual antes de substituir
    const currentBackup = this.dbPath + '.before-restore';
    fs.copyFileSync(this.dbPath, currentBackup);

    // Restaura
    fs.copyFileSync(backupPath, this.dbPath);

    console.log('Restore completed');
    console.log(`Previous database backed up to: ${currentBackup}`);
  }

  async listBackups() {
    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('extractions_'))
      .sort()
      .reverse();

    return files.map(file => ({
      file: file,
      path: path.join(this.backupDir, file),
      size: fs.statSync(path.join(this.backupDir, file)).size,
      created: fs.statSync(path.join(this.backupDir, file)).birthtime
    }));
  }

  async cleanOldBackups(keepDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    const backups = await this.listBackups();
    let deleted = 0;

    for (const backup of backups) {
      if (backup.created < cutoffDate) {
        fs.unlinkSync(backup.path);
        deleted++;
      }
    }

    console.log(`Deleted ${deleted} old backups`);
  }
}

module.exports = BackupManager;
```

### Backup Agendado

```javascript
const cron = require('node-cron');
const BackupManager = require('./src/storage/backup');

const backup = new BackupManager('./data/extractions.db');

// Backup diário às 2h da manhã
cron.schedule('0 2 * * *', async () => {
  console.log('Running scheduled backup...');
  await backup.createBackup();
  await backup.cleanOldBackups(30); // Mantém 30 dias
});
```

---

## 🔧 Otimizações

### VACUUM

```sql
-- Libera espaço não utilizado
VACUUM;

-- Analisa e otimiza queries
ANALYZE;
```

### WAL Mode (Write-Ahead Logging)

```sql
-- Habilita WAL mode (melhor performance)
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000; -- 64MB cache
PRAGMA temp_store = MEMORY;
```

### Auto-VACUUM

```sql
PRAGMA auto_vacuum = INCREMENTAL;
PRAGMA incremental_vacuum(100); -- Libera 100 páginas
```

---

**Próximo:** [09-deployment.md](09-deployment.md) - Deploy e Infraestrutura