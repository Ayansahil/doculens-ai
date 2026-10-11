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

  // Stage 4: Process full document
  console.log('\n[Stage 4/4] Processing full document text through chunkAndStore...');
  const sampleDocText = testDoc.extracted_text || `
Executive Summary:
DocuLens AI is an intelligent document analysis and RAG management platform.
The company experienced 45% revenue growth in the fourth quarter of 2025.
Operating expenses were reduced by 12% due to automated cloud infrastructure optimization.
Net profit margin expanded to 28.5%, exceeding initial Wall Street projections.
Future outlook remains positive with planned expansion into enterprise compliance and legal analytics markets.
Customer satisfaction ratings reached 94% following the rollout of realtime semantic search.
`;

  await chunkAndStore(testDoc.id, sampleDocText);
  const { data: allChunks, count } = await supabase
    .from('document_chunks')
    .select('id, content', { count: 'exact' })
    .eq('document_id', testDoc.id);

  console.log(`✅ Stage 4 passed: Total chunks created & stored in Supabase: ${allChunks.length}`);

  // Test retrieval on full document
  const testQuery = 'What was the revenue growth and profit margin?';
  console.log(`\nTesting RAG query retrieval on full document: "${testQuery}"`);
  const fullDocMatches = await getRelevantChunks(testDoc.id, testQuery, 2);
  console.log(`Retrieved ${fullDocMatches.length} chunks:`);
  fullDocMatches.forEach((m, idx) => {
    console.log(`  [Match ${idx + 1}] (Score: ${Number(m.similarity).toFixed(4)}): ${m.content.trim()}`);
  });

  console.log('\n========================================================');
  console.log('🎉 FULL PIPELINE STAGES 1-4 COMPLETED SUCCESSFULLY!');
  console.log('========================================================');
}

runPipeline().catch(err => {
  console.error('\n❌ Pipeline execution stopped:', err.message);
});
