import dotenv from 'dotenv';
import fs from 'node:fs';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function readCertFile(envVar, fallbackPath, label) {
  const filePath = process.env[envVar] || fallbackPath;
  if (!filePath) throw new Error(`[DB] Variável ${envVar} não definida no .env.`);
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  if (!fs.existsSync(resolved)) throw new Error(`[DB] Arquivo de ${label} não encontrado em "${resolved}".`);
  return fs.readFileSync(resolved);
}

function resolveSSLConfig() {
  const ca = readCertFile('DB_SSL_CA_PATH', process.env.DB_SSL_CERT_PATH || './certs/ca-certificate.crt', 'certificado da CA');
  const cert = readCertFile('DB_SSL_CLIENT_CERT_PATH', './certs/certificate.pem', 'certificado do cliente');
  const key = readCertFile('DB_SSL_KEY_PATH', './certs/private-key.key', 'chave privada do cliente');
  const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase().trim() !== 'false';
  return { ca, cert, key, rejectUnauthorized, require: true };
}

let sslConfig;
try {
  sslConfig = resolveSSLConfig();
  console.log('[DB] Certificados de conexão carregados — TLS mútuo (mTLS) habilitado.');
} catch (err) {
  console.error(err.message);
  console.error('[DB] Encerrando: certificados válidos são obrigatórios.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig });
pool.on('error', (err) => console.error('[DB] Erro inesperado no pool:', err.message));

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analises (
  id SERIAL PRIMARY KEY,
  image_url TEXT,
  metrics JSONB NOT NULL,
  gemini_analysis TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analises_created_at ON analises (created_at DESC);
`;

let schemaReady = false;
async function ensureSchema() {
  try {
    await pool.query(CREATE_SCHEMA_SQL);
    schemaReady = true;
    console.log('[DB] Schema verificado/criado com sucesso.');
  } catch (err) {
    schemaReady = false;
    console.error('[DB] Falha ao garantir schema:', err.message);
  }
}

async function queryWithSchemaRetry(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === '42P01' && !schemaReady) {
      await ensureSchema();
      return pool.query(sql, params);
    }
    throw err;
  }
}

function buildAnthropometryPrompt(metrics) {
  return `Você é um sistema de apoio à análise antropométrica facial, com foco estritamente técnico, estatístico e descritivo.
Não faça julgamentos estéticos, não atribua notas de beleza, não faça diagnósticos médicos e não infira idade, etnia, gênero, saúde ou características sensíveis.
Descreva somente relações geométricas presentes nos dados recebidos.

Métricas calculadas no navegador:
${JSON.stringify(metrics, null, 2)}

Responda em português do Brasil usando as seções:
1. Resumo Geral
2. Terços do Rosto
3. Olhos e Espaçamento
4. Nariz e Lábios
5. Mandíbula e Simetria
6. Observação Final

Não invente métricas que não foram fornecidas.`;
}

async function analyzeWithGemini(metrics) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY não configurada.');
  }
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: buildAnthropometryPrompt(metrics),
    config: {
      temperature: 0.2,
      maxOutputTokens: 1200
    }
  });
  const text = typeof response.text === 'string' ? response.text.trim() : '';
  if (!text) throw new Error('Gemini retornou uma resposta vazia ou bloqueada.');
  return text;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Arquivo enviado não é uma imagem válida.'));
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  let metrics;
  try {
    metrics = typeof req.body.metrics === 'string' ? JSON.parse(req.body.metrics) : req.body.metrics;
  } catch {
    return res.status(400).json({ error: 'Campo "metrics" inválido: JSON inválido.' });
  }
  if (!metrics || typeof metrics !== 'object') {
    return res.status(400).json({ error: 'Campo "metrics" é obrigatório.' });
  }

  let geminiAnalysis = null;
  let aiError = null;
  try {
    geminiAnalysis = await analyzeWithGemini(metrics);
  } catch (err) {
    aiError = err instanceof Error ? err.message : String(err);
    console.error('[Gemini] Falha na interpretação:', aiError);
    geminiAnalysis = 'A análise matemática foi concluída, mas a interpretação do Gemini não está disponível neste momento.';
  }

  try {
    const insertSQL = `
      INSERT INTO analises (image_url, metrics, gemini_analysis)
      VALUES ($1, $2, $3)
      RETURNING id, image_url, metrics, gemini_analysis, created_at;
    `;
    const { rows } = await queryWithSchemaRetry(insertSQL, [null, metrics, geminiAnalysis]);
    return res.status(201).json({
      success: true,
      analysis: rows[0],
      imagePreview: req.file ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}` : null,
      ai: { available: !aiError, error: aiError }
    });
  } catch (err) {
    console.error('[POST /api/analyze] Erro no banco:', err);
    return res.status(500).json({
      error: 'Falha ao salvar a análise facial.',
      detail: err instanceof Error ? err.message : String(err),
      ai: { available: !aiError, error: aiError }
    });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { rows } = await queryWithSchemaRetry(
      `SELECT id, metrics, gemini_analysis, created_at FROM analises ORDER BY created_at DESC LIMIT $1;`,
      [limit]
    );
    return res.json({ success: true, history: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao buscar histórico.', detail: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({ status: 'ok', model: GEMINI_MODEL, dbSchemaReady: schemaReady, database: dbOk, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

ensureSchema().finally(() => {
  app.listen(PORT, () => console.log(`[Server] Facial Metrics Analyzer rodando na porta ${PORT}`));
});
