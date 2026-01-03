// app/api/knowledge-search/route.ts
// Pineconeナレッジベース検索API

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { NextRequest } from 'next/server';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'knowledge-base';

// クライアント初期化（グローバルで1回のみ）
let pineconeClient: Pinecone | null = null;
let openaiClient: OpenAI | null = null;

// #####################################################
// #####################################################
// #####################################################
function initClients() {
  if (!pineconeClient && PINECONE_API_KEY) {
    pineconeClient = new Pinecone({ apiKey: PINECONE_API_KEY });
  }
  if (!openaiClient && OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
}

// #####################################################
// #####################################################
// #####################################################
export async function POST(request: NextRequest) {
  try {
    // APIキーのチェック
    if (!PINECONE_API_KEY || !OPENAI_API_KEY) {
      console.warn('Pinecone or OpenAI API key is missing');
      return new Response(
        JSON.stringify({ 
          success: false,
          context: '',
          error: 'API keys not configured' 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    initClients();

    // リクエストボディから質問を取得
    let body: any = {};
    try {
      const text = await request.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch (e) {
      console.error('JSON parse error:', e);
    }

    const query = body.query || body.question || '';

    if (!query.trim()) {
      return new Response(
        JSON.stringify({ success: false, context: '' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Knowledge Search] Query:', query);

    // 1. クエリをベクトル化
    const embeddingResponse = await openaiClient!.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const queryVector = embeddingResponse.data[0].embedding;

    // 2. Pineconeで検索
    const index = pineconeClient!.index(PINECONE_INDEX_NAME);
    const searchResults = await index.query({
      vector: queryVector,
      topK: 3,
      includeMetadata: true,
    });

    console.log('[Knowledge Search] Found', searchResults.matches.length, 'matches');

    // 3. 検索結果を整形
    const knowledgeItems = searchResults.matches.map((match) => ({
      score: match.score || 0,
      text: (match.metadata?.text as string) || '',
      source: (match.metadata?.source as string) || 'unknown',
    }));

    // 4. コンテキストを作成（アバターに渡す情報）
    const context = knowledgeItems
      .filter(item => item.score > 0.1) // スコアが0.1以上のもののみ
      .map((item, index) => `\n\n【参考情報${index + 1}】: ${item.text}`)
      .join('\n');

    console.log('[Knowledge Search] Context length:', context.length);
    console.log('=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+');
    console.log('[Knowledge Search] Context:', context);
    console.log('=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+=+');

    // 5. レスポンスを返す
    return new Response(
      JSON.stringify({
        success: true,
        context: context.slice(0, 500),
        sources: knowledgeItems,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Knowledge Search] Error:', error);

    // エラーが発生しても空のコンテキストを返す（フォールバック）
    return new Response(
      JSON.stringify({ 
        success: false, 
        context: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
