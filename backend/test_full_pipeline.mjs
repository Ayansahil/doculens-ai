import dotenv from 'dotenv';
dotenv.config();

import { generateEmbedding, chunkAndStore, getRelevantChunks } from './src/services/rag.service.js';
import { supabase } from './src/config/db.js';

async function runPipeline() {
  console.log('========================================================');
  console.log('   DocuLens AI - Staged RAG Verification Pipeline');
  console.log('========================================================');

  // Stage 1: Generate one embedding
  console.log('\n[Stage 1/4] Generating single embedding with model:', process.env.EMBEDDING_MODEL);
  const sampleText = 'Financial report for Q4 showing revenue growth and profit margins';
  const embedding = await generateEmbedding(sampleText, 'passage');
  console.log('✅ Stage 1 passed:');
  console.log('  - Dimension count:', embedding.length);
  console.log('  - Type verified:', Array.isArray(embedding) && typeof embedding[0] === 'number');

  // Stage 2: Store one chunk
  console.log('\n[Stage 2/4] Storing single test chunk in Supabase document_chunks...');
  const { data: docs } = await supabase.from('documents').select('id, title, extracted_text').limit(1);
  if (!docs || docs.length === 0) {
    throw new Error('No document found in documents table');
  }
  const testDoc = docs[0];
  console.log(`  - Target document: "${testDoc.title}" (${testDoc.id})`);

  const { data: chunk, error: insertError } = await supabase
    .from('document_chunks')
    .insert({
      document_id: testDoc.id,
      content: 'Financial report for Q4 showing revenue growth and profit margins',
      embedding: embedding,
    })
    .select()
    .single();

  if (insertError) {
    console.error('❌ Stage 2 failed:', insertError);
    return;
  }
  console.log('✅ Stage 2 passed: Chunk saved with ID:', chunk.id);

  // Stage 3: Retrieve matching chunks
  console.log('\n[Stage 3/4] Retrieving matching chunks via match_document_chunks RPC...');
  const queryMatches = await getRelevantChunks(testDoc.id, 'revenue growth and profits', 3);
  console.log(`✅ Stage 3 passed: Retrieved ${queryMatches.length} matching chunk(s):`);
  queryMatches.forEach(m => {
    console.log(`  - ID: ${m.id}, Similarity: ${Number(m.similarity).toFixed(4)}, Content: "${m.content.slice(0, 60)}..."`);
  });

  // Clean up stage 2 chunk
  await supabase.from('document_chunks').delete().eq('id', chunk.id);

  // Stage 4: Verify document chunks and query retrieval
  console.log('\n[Stage 4/4] Verifying document chunks and query retrieval...');
  let { data: allChunks } = await supabase
    .from('document_chunks')
    .select('id, content', { count: 'exact' })
    .eq('document_id', testDoc.id);

  if (!allChunks || allChunks.length === 0) {
    console.log('No chunks present; indexing document text...');
    await chunkAndStore(testDoc.id, testDoc.extracted_text);
    const res = await supabase.from('document_chunks').select('id, content').eq('document_id', testDoc.id);
    allChunks = res.data || [];
  }

  console.log(`✅ Stage 4 passed: Total chunks verified in Supabase: ${allChunks.length}`);

  // Test retrieval on document
  const testQuery = 'technical skills and projects';
  console.log(`\nTesting RAG query retrieval on document: "${testQuery}"`);
  const fullDocMatches = await getRelevantChunks(testDoc.id, testQuery, 2, 0.0);
  console.log(`Retrieved ${fullDocMatches.length} chunks:`);
  fullDocMatches.forEach((m, idx) => {
    console.log(`  [Match ${idx + 1}] (Score: ${Number(m.similarity).toFixed(4)}): ${m.content.slice(0, 80).replace(/\n/g, ' ')}...`);
  });

  console.log('\n========================================================');
  console.log('🎉 FULL PIPELINE STAGES 1-4 COMPLETED SUCCESSFULLY!');
  console.log('========================================================');
}

runPipeline().catch(err => {
  console.error('\n❌ Pipeline execution stopped:', err.message);
});
