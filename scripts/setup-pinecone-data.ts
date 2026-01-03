/**
 * Pineconeデータベースにサンプルデータを登録するスクリプト (TypeScript版)
 */

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// ==================== 設定 ====================
const config = {
  pinecone: {
    apiKey: process.env.PINECONE_API_KEY || 'your-pinecone-api-key',
    indexName: 'knowledge-base',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key',
  },
};

// ==================== 型定義 ====================
interface Document {
  id: string;
  text: string;
  source: string;
}

// ==================== サンプルデータ ====================
const SAMPLE_DOCUMENTS: Document[] = [
  {
    id: 'doc_001',
    text: 'HeyGenはAI技術を活用したアバター動画生成プラットフォームです。リアルなアバターと音声合成により、簡単に高品質な動画コンテンツを作成できます。',
    source: 'heygen_info',
  },
  {
    id: 'doc_002',
    text: 'Pineconeは高速なベクトル検索を提供するマネージドベクトルデータベースです。機械学習モデルの埋め込みベクトルを効率的に保存・検索できます。',
    source: 'pinecone_info',
  },
  {
    id: 'doc_003',
    text: 'RAG（Retrieval-Augmented Generation）は、外部ナレッジベースから関連情報を検索し、それを基にLLMで回答を生成する手法です。',
    source: 'rag_info',
  },
  {
    id: 'doc_004',
    text: 'ベクトル埋め込み（Embedding）は、テキストや画像などのデータを数値ベクトルに変換する技術です。意味的に類似したデータは近いベクトルになります。',
    source: 'embedding_info',
  },
  {
    id: 'doc_005',
    text: 'OpenAIのtext-embedding-3-smallモデルは、1536次元のベクトルを生成し、コストパフォーマンスに優れた埋め込みモデルです。',
    source: 'openai_info',
  },
];

// ==================== クライアント初期化 ====================
const pineconeClient = new Pinecone({
  apiKey: config.pinecone.apiKey,
});

const openaiClient = new OpenAI({
  apiKey: config.openai.apiKey,
});

// ==================== 関数 ====================

/**
 * Pineconeインデックスをセットアップ
 */
async function setupPineconeIndex(): Promise<any> {
  console.log('🔧 Pineconeインデックスをセットアップ中...');

  try {
    // 既存のインデックスを確認
    const indexes = await pineconeClient.listIndexes();
    const existingIndex = indexes.indexes?.find(
      (idx) => idx.name === config.pinecone.indexName
    );

    if (!existingIndex) {
      console.log(`  ✓ インデックス '${config.pinecone.indexName}' を作成中...`);
      await pineconeClient.createIndex({
        name: config.pinecone.indexName,
        dimension: 1536, // text-embedding-3-smallの次元数
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      });
      console.log(`  ✓ インデックス '${config.pinecone.indexName}' を作成しました！`);
      
      // インデックスの初期化を待つ
      console.log('  ⏳ インデックスの初期化を待っています...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    } else {
      console.log(`  ✓ インデックス '${config.pinecone.indexName}' は既に存在します`);
    }

    return pineconeClient.index(config.pinecone.indexName);
  } catch (error) {
    console.error('❌ インデックスセットアップエラー:', error);
    throw error;
  }
}

/**
 * テキストをベクトルに変換
 */
async function embedText(text: string): Promise<number[]> {
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * サンプルドキュメントをPineconeにアップロード
 */
async function uploadDocuments(index: any): Promise<void> {
  console.log(`\n📤 ${SAMPLE_DOCUMENTS.length}件のドキュメントをアップロード中...`);

  try {
    const vectors = [];

    for (const doc of SAMPLE_DOCUMENTS) {
      console.log(`  処理中: ${doc.id} - ${doc.text.slice(0, 50)}...`);

      // テキストをベクトル化
      const vector = await embedText(doc.text);

      // メタデータと共に保存
      vectors.push({
        id: doc.id,
        values: vector,
        metadata: {
          text: doc.text,
          source: doc.source,
        },
      });
    }

    // 一括アップロード
    await index.upsert(vectors);
    console.log(`  ✓ ${vectors.length}件のドキュメントをアップロードしました！`);
  } catch (error) {
    console.error('❌ アップロードエラー:', error);
    throw error;
  }
}

/**
 * データが正しくアップロードされたか確認
 */
async function verifyData(index: any): Promise<void> {
  console.log('\n✅ データ確認中...');

  try {
    const stats = await index.describeIndexStats();
    console.log(`  ✓ 登録ベクトル数: ${stats.totalRecordCount || 0}`);
    console.log(`  ✓ 次元数: ${stats.dimension || 0}`);
  } catch (error) {
    console.error('❌ データ確認エラー:', error);
    throw error;
  }
}

/**
 * メイン処理
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Pinecone サンプルデータ登録スクリプト (TypeScript版)');
  console.log('='.repeat(60));

  try {
    // 1. インデックスのセットアップ
    const index = await setupPineconeIndex();

    // 2. ドキュメントのアップロード
    await uploadDocuments(index);

    // 3. データ確認
    await verifyData(index);

    console.log('\n✨ セットアップ完了！');
    console.log('   これで heygen-pinecone-search.ts を実行できます。');
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// ==================== 実行 ====================
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { setupPineconeIndex, uploadDocuments, verifyData };