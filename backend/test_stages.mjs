import dotenv from 'dotenv';
dotenv.config();

import { generateEmbedding, chunkAndStore, getRelevantChunks } from './src/services/rag.service.js';
import { supabase } from './src/config/db.js';

async function testStage1() {
  console.log('\n=== Stage 1: Generate One Embedding ===');
  const sampleText = 'Antigravity DocuLens AI test text for semantic vector embedding';
  const embedding = await generateEmbedding(sampleText, 'passage');
  console.log('✅ Embedding generated successfully!');
  console.log('Embedding type:', typeof embedding);
  console.log('Is array:', Array.isArray(embedding));
  console.log('Dimensions (length):', embedding.length);
  console.log('First 5 values:', embedding.slice(0, 5));
  console.log('Every element is a number:', embedding.every(n => typeof n === 'number'));
  return embedding;
}

async function testStage2(embedding) {
  console.log('\n=== Stage 2: Store One Chunk ===');
  // First get or use an existing document
  const { data: docs } = await supabase.from('documents').select('id, title').limit(1);
  if (!docs || docs.length === 0) {
    console.log('❌ No document found in documents table to test chunk storage');
    return null;
  }
  const testDocId = docs[0].id;
  console.log(`Using test document ID: ${testDocId} (${docs[0].title})`);

  const { data: chunk, error: insertError } = await supabase
    .from('document_chunks')
    .insert({
      document_id: testDocId,
      content: 'This is a stage 2 test chunk stored for semantic verification.',
      embedding: embedding,
    })
    .select()
    .single();

  if (insertError) {
    console.error('❌ Stage 2 failed - Chunk insertion error:', insertError);
    return null;
  }

  console.log('✅ Stage 2 succeeded - Stored chunk ID:', chunk.id);
  return { testDocId, chunkId: chunk.id };
}

async function testStage3(testDocId, chunkId) {
  console.log('\n=== Stage 3: Retrieve Matching Chunks ===');
  const query = 'semantic verification test';
  const matches = await getRelevantChunks(testDocId, query, 3);
  console.log(`Found ${matches.length} matching chunks:`);
  matches.forEach(m => {
    console.log(`- ID: ${m.id}, Similarity: ${m.similarity}, Content: "${m.content}"`);
  });

  // Clean up stage test chunk
  if (chunkId) {
    await supabase.from('document_chunks').delete().eq('id', chunkId);
    console.log('Cleaned up test chunk ID:', chunkId);
  }
}

async function run() {
  try {
    const embedding = await testStage1();
    const stored = await testStage2(embedding);
    if (stored) {
      await testStage3(stored.testDocId, stored.chunkId);
    }
  } catch (err) {
    console.error('Test pipeline error:', err.message);
  }
}

run();
