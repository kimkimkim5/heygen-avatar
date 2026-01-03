/**
 * PDF / Word / TXT からテキストを抽出して Pinecone に登録
 * 【確定動作版】pdf-parse@2.2.0 + CommonJS
 */

require('dotenv').config({ path: '.env' });

const fs = require('fs');
const path = require('path');

const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai').default;

// =========================
// 設定
// =========================
const DOCUMENTS_FOLDER = './documents';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'knowledge-base';

const CHUNK_SIZE = 100;
const CHUNK_OVERLAP = 20;
const EMBEDDING_BATCH_DELAY = 1000; // ms

// =========================
// クライアント
// =========================
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =========================
// PDF
// =========================
async function extractTextFromPDF(filePath) {
  console.log(`  📄 PDF処理中: ${path.basename(filePath)}`);
  try {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    console.log(
      `    ✓ ${data.numpages}ページ、${data.text.length}文字を抽出`
    );
    return data.text;
  } catch (e) {
    console.error('    ✗ PDFの読み込みエラー:', e.message);
    return null;
  }
}

// =========================
// Word
// =========================
async function extractTextFromWord(filePath) {
  console.log(`  📄 Word処理中: ${path.basename(filePath)}`);
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    console.log(`    ✓ ${result.value.length}文字を抽出`);
    return result.value;
  } catch (e) {
    console.error('    ✗ Wordの読み込みエラー:', e.message);
    return null;
  }
}

// =========================
// TXT
// =========================
function extractTextFromTXT(filePath) {
  console.log(`  📄 TXT処理中: ${path.basename(filePath)}`);
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    console.log(`    ✓ ${text.length}文字を抽出`);
    return text;
  } catch (e) {
    console.error('    ✗ TXTの読み込みエラー:', e.message);
    return null;
  }
}

// =========================
// ファイル分岐
// =========================
async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractTextFromPDF(filePath);
  if (ext === '.doc' || ext === '.docx')
    return extractTextFromWord(filePath);
  if (ext === '.txt') return extractTextFromTXT(filePath);
  return null;
}

// =========================
// チャンク
// =========================
function splitText(text, size = 1000, overlap = 200) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) chunks.push(chunk);
    i += size - overlap;
  }
  return chunks;
}

// =========================
// Embedding
// =========================
async function embed(text) {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

// =========================
// Pinecone
// =========================
async function setupIndex() {
  const list = await pinecone.listIndexes();
  const exists = list.indexes?.some(
    (i) => i.name === PINECONE_INDEX_NAME
  );

  if (!exists) {
    await pinecone.createIndex({
      name: PINECONE_INDEX_NAME,
      dimension: 1536,
      metric: 'cosine',
      spec: {
        serverless: { cloud: 'aws', region: 'us-east-1' },
      },
    });
    await new Promise((r) => setTimeout(r, EMBEDDING_BATCH_DELAY));
  }

  return pinecone.index(PINECONE_INDEX_NAME);
}

// =========================
// メイン処理
// =========================
async function main() {
  console.log('='.repeat(60));
  console.log('PDF / Word → Pinecone 登録（確定動作版）');
  console.log('='.repeat(60));

  const index = await setupIndex();

  const files = fs
    .readdirSync(DOCUMENTS_FOLDER)
    .filter((f) =>
      ['.pdf', '.doc', '.docx', '.txt'].includes(
        path.extname(f).toLowerCase()
      )
    );

  const vectors = [];

  for (const file of files) {
    const filePath = path.join(DOCUMENTS_FOLDER, file);
    const text = await extractTextFromFile(filePath);
    if (!text) continue;

    const chunks = splitText(text, CHUNK_SIZE, CHUNK_OVERLAP);
    console.log(`    ✓ ${chunks.length}チャンク生成`);

    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embed(chunks[i]);
      vectors.push({
        id: `${path.parse(file).name}_${i + 1}`,
        values: embedding,
        metadata: { source: file, text: chunks[i] },
      });
    }
  }

  for (let i = 0; i < vectors.length; i += 100) {
    await index.upsert(vectors.slice(i, i + 100));
  }

  console.log(`\n✅ 登録完了: ${vectors.length}チャンク`);
}

main().catch((e) => {
  console.error('❌ 致命的エラー:', e);
  process.exit(1);
});
