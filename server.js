require('dotenv').config();

const fs = require('fs');
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

/**
 * Resolve a configuração de SSL da conexão com o PostgreSQL.
 *
 * A partir de agora a conexão com o banco EXIGE certificados — não é mais
 * possível conectar sem TLS mútuo (mTLS). São necessários três arquivos,
 * cujos caminhos vêm do .env:
 *
 *   - DB_SSL_CA_PATH   (ou DB_SSL_CERT_PATH, legado)  -> CA que assinou o servidor
 *   - DB_SSL_CLIENT_CERT_PATH                          -> certificado do cliente
 *   - DB_SSL_KEY_PATH                                  -> chave privada do cliente
 *
 * Se qualquer um desses arquivos não existir ou não puder ser lido, o
 * processo é interrompido imediatamente (falha rápida e explícita) em vez
 * de deixar o pool subir "sem SSL" silenciosamente — o que era o
 * comportamento antigo e permitia conexões inseguras por engano.
 *
 * DB_SSL_REJECT_UNAUTHORIZED continua controlando se a cadeia do servidor é
 * validada contra a CA fornecida (o padrão é `true`; só use `false` em
 * ambientes de desenvolvimento com certificado autoassinado).
 */
function readCertFile(envVar, fallbackPath, label) {
  const filePath = process.env[envVar] || fallbackPath;
  if (!filePath) {
    throw new Error(
      `[DB] Variável ${envVar} não definida no .env. É obrigatório apontar para o ${label}.`
    );
  }
  const resolved = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `[DB] Arquivo de ${label} não encontrado em "${resolved}" (variável ${envVar}). ` +
      'A conexão com o banco agora exige certificados válidos.'
    );
  }
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
  console.error('[DB] Encerrando: não é permitido iniciar o servidor sem certificados válidos para o PostgreSQL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool do PostgreSQL:', err.message);
});

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS analises (
  id              SERIAL PRIMARY KEY,
  image_url       TEXT,
  metrics         JSONB NOT NULL,
  gemini_analysis TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
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
    console.error(
      '[DB] Verifique DATABASE_URL e os caminhos dos certificados (DB_SSL_CA_PATH, ' +
      'DB_SSL_CLIENT_CERT_PATH, DB_SSL_KEY_PATH) no seu .env. A conexão exige mTLS válido.'
    );
  }
}

/**
 * Executa uma query e, se falhar porque a tabela ainda não existe
 * (ex: primeiro boot com DATABASE_URL corrigido depois de um erro anterior),
 * tenta recriar o schema uma vez e repete a query.
 */
async function queryWithSchemaRetry(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === '42P01' && !schemaReady) {
      console.warn('[DB] Tabela "analises" não encontrada — tentando recriar o schema...');
      await ensureSchema();
      return pool.query(sql, params);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Monta um prompt estruturado, neutro e estatístico para a análise
 * antropométrica facial a partir das 19 métricas calculadas no navegador.
 */
function buildAnthropometryPrompt(metrics) {
  return `Você é um sistema de apoio à análise antropométrica facial, com foco estritamente
  técnico, estatístico e descritivo. Você NÃO faz julgamentos estéticos, NÃO atribui
  notas de "beleza", NÃO faz diagnósticos médicos e NÃO infere idade, etnia, gênero,
  saúde ou qualquer característica sensível. Sua única tarefa é descrever, em linguagem
  clara e objetiva, as proporções faciais reveladas pelas 19 métricas abaixo, comparando-as
  entre si (por exemplo: relação entre terços do rosto, simetria aproximada entre os dois
  olhos, proporção nariz/boca, etc.), sempre em tom neutro e educativo, como um relatório
  de geometria facial.

  Métricas recebidas (valores brutos, em pixels/graus, escalados a partir da imagem enviada):
  ${JSON.stringify(metrics, null, 2)}

  Estruture a resposta em português do Brasil, em markdown simples, com as seções:
  1. **Resumo Geral** (2-3 frases sobre as proporções gerais do rosto)
  2. **Terços do Rosto** (comparação entre altura da testa, terço médio e terço inferior)
  3. **Simetria e Espaçamento dos Olhos** (com base nas áreas dos olhos e distância entre eles)
  4. **Nariz e Lábios** (proporções entre comprimento/largura do nariz e altura dos lábios)
  5. **Sobrancelhas** (formato aproximado, com base nos detectores de forma e inclinação)
  6. **Observação Final** (nota de que essa é uma análise geométrica estatística, sem
  qualquer validade médica, estética ou diagnóstica)

  Mantenha o texto direto, sem floreios, e não invente métricas que não foram fornecidas.`;
}

async function analyzeWithGemini(metrics) {
  const prompt = buildAnthropometryPrompt(metrics);
  const response = await genAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });
  return response.text;
}

// ---------------------------------------------------------------------------
// Multer (upload de imagem em memória — não persistimos o arquivo em disco
// neste exemplo; se quiser servir a imagem depois, troque para storage em
// disco ou em um bucket externo e salve a URL real em `image_url`)
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
                      limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
                      fileFilter: (req, file, cb) => {
                        if (file.mimetype.startsWith('image/')) {
                          cb(null, true);
                        } else {
                          cb(new Error('Arquivo enviado não é uma imagem válida.'));
                        }
                      }
});

// ---------------------------------------------------------------------------
// Middlewares
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

/**
 * POST /api/analyze
 * Recebe multipart/form-data:
 *   - image: arquivo de imagem (opcional, apenas para referência/preview)
 *   - metrics: string JSON com as 19 métricas calculadas no navegador
 */
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    let metrics;
    try {
      metrics = typeof req.body.metrics === 'string'
      ? JSON.parse(req.body.metrics)
      : req.body.metrics;
    } catch (parseErr) {
      return res.status(400).json({ error: 'Campo "metrics" inválido: precisa ser um JSON válido.' });
    }

    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'Campo "metrics" é obrigatório.' });
    }

    // Neste exemplo não fazemos upload para um storage externo, então
    // guardamos apenas um placeholder. Troque por uma URL real se você
    // conectar um bucket (S3, Cloudinary, etc).
    const imageUrl = req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : null;

    const geminiAnalysis = await analyzeWithGemini(metrics);

    const insertSQL = `
    INSERT INTO analises (image_url, metrics, gemini_analysis)
    VALUES ($1, $2, $3)
    RETURNING id, image_url, metrics, gemini_analysis, created_at;
    `;
    // Evita gravar a imagem base64 inteira no banco por padrão (fica pesado).
    // Se quiser persistir a imagem, troque `null` por `imageUrl` abaixo.
    const { rows } = await queryWithSchemaRetry(insertSQL, [null, metrics, geminiAnalysis]);

    return res.status(201).json({
      success: true,
      analysis: rows[0],
      imagePreview: imageUrl
    });
  } catch (err) {
    console.error('[POST /api/analyze] Erro:', err);
    return res.status(500).json({ error: 'Falha ao processar a análise facial.', detail: err.message });
  }
});

/**
 * GET /api/history
 * Retorna as últimas análises salvas (mais recentes primeiro).
 */
app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { rows } = await queryWithSchemaRetry(
      `SELECT id, metrics, gemini_analysis, created_at
      FROM analises
      ORDER BY created_at DESC
      LIMIT $1;`,
      [limit]
    );
    return res.json({ success: true, history: rows });
  } catch (err) {
    console.error('[GET /api/history] Erro:', err);
    return res.status(500).json({ error: 'Falha ao buscar histórico.', detail: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: GEMINI_MODEL, dbSchemaReady: schemaReady });
});

// Fallback para SPA simples
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
ensureSchema().finally(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Facial Metrics Analyzer rodando na porta ${PORT}`);
  });
});
