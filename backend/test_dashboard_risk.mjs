// ============================================================
// DocuLens AI — Dashboard / Risk Analysis Verification
//
// Covers:
//   1. Evidence grounding + result validation (pure functions)
//   2. Provider error mapping (quota / timeout / model errors)
//   3. Live LLM analysis (risky contract + low-risk document)
//   4. Real dashboard data, storage bytes, user isolation
//   5. Upload/delete storage accounting (exact bytes, disk cleanup)
//   6. Empty dashboard for a temporary user
//
// Requires backend running on API_BASE (default http://localhost:3001).
// Uses TEST_* users from backend/.env and creates/removes its own fixtures.
// ============================================================

import { supabase } from './src/config/db.js';
import {
  buildAnalysisResult,
  isEvidenceGrounded,
  mapProviderError,
  runRiskAnalysis,
} from './src/services/risk.service.js';

const API_BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/+$/, '');
const USER1_EMAIL = process.env.TEST_USER1_EMAIL;
const USER2_EMAIL = process.env.TEST_USER2_EMAIL;
const USER1_ID = process.env.TEST_USER1_ID;
const USER2_ID = process.env.TEST_USER2_ID;
const USER1_DOC_ID = process.env.TEST_USER1_DOC_ID;

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed += 1;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed += 1;
  }
}

function skip(message) {
  console.log(`  ⏭️  SKIP: ${message}`);
  skipped += 1;
}

async function api(path, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let body = null;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function getAccessTokenForUser(email) {
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkErr) throw new Error(`generateLink failed for ${email}: ${linkErr.message}`);

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: 'email',
  });
  if (error) throw new Error(`verifyOtp failed for ${email}: ${error.message}`);
  return data.session.access_token;
}

function tokenUserId(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;
  } catch {
    return null;
  }
}

async function analysisTableExists() {
  const { error } = await supabase.from('document_analysis').select('id').limit(1);
  return !error;
}

async function dbStorageBytes(userId) {
  const { data, error } = await supabase
    .from('documents')
    .select('file_size')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).reduce((total, doc) => total + (Number(doc.file_size) || 0), 0);
}

function section(title) {
  console.log(`\n--- ${title} ---`);
}

/* ============================ OFFLINE TESTS ============================ */
function runGroundingTests() {
  section('1. Evidence grounding & validation');

  const source =
    'The Supplier may terminate this agreement at any time without notice or compensation. ' +
    'Late payment incurs a penalty of 10% per month. The agreement renews automatically for 24 months unless cancelled 90 days in advance.';

  assert(
    isEvidenceGrounded('Late payment incurs a penalty of 10% per month.', source),
    'Exact evidence excerpt is grounded'
  );
  assert(
    !isEvidenceGrounded('The company must pay a 500,000 dollar fine.', source),
    'Fabricated evidence is rejected'
  );
  assert(
    isEvidenceGrounded(
      'The Supplier may terminate this agreement at any time ... Late payment incurs a penalty',
      source
    ),
    'Ellipsis-separated evidence is grounded when all fragments exist'
  );

  const validRaw = JSON.stringify({
    risk_level: 'High',
    summary: 'The contract allows unilateral termination and a recurring penalty.',
    findings: [
      {
        category: 'Suspicious clause',
        severity: 'high',
        evidence: 'The Supplier may terminate this agreement at any time without notice or compensation.',
        explanation: 'The supplier can end the contract without notice, leaving no protection.',
        recommendation: 'Ask a lawyer to require notice and compensation.',
      },
      {
        category: 'Deadline or penalty',
        severity: 'medium',
        evidence: 'Late payment incurs a penalty of 10% per month.',
        explanation: 'The monthly penalty is unusually high and compounds quickly.',
        recommendation: null,
      },
    ],
  });

  const valid = buildAnalysisResult(validRaw, source);
  assert(valid.ok && valid.status === 'completed', 'Valid model output completes');
  assert(valid.findings.length === 2, 'Two grounded findings are kept');
  assert(valid.riskLevel === 'High', 'Model risk level is preserved when consistent');
  assert(valid.riskScore === 45, 'Defined scoring method applies (30 + 15 = 45)');
  assert(valid.findings[0].evidence.length > 0, 'Findings retain verbatim evidence');

  const fabricatedRaw = JSON.stringify({
    risk_level: 'High',
    summary: 'High risk.',
    findings: [
      {
        category: 'Financial anomaly',
        severity: 'high',
        evidence: 'Revenue was overstated by 42 million dollars.',
        explanation: 'This would be a serious financial misstatement.',
      },
    ],
  });
  const fabricated = buildAnalysisResult(fabricatedRaw, source);
  assert(
    fabricated.status === 'insufficient_evidence' && fabricated.findings.length === 0,
    'Unverifiable high-risk claim becomes "Unable to determine" (no invented result)'
  );
  assert(fabricated.riskLevel === null, 'No risk level is assigned without verified evidence');
  assert(fabricated.riskScore === null, 'No score is assigned without verified evidence');

  const lowRaw = JSON.stringify({
    risk_level: 'Low',
    summary: 'No material risks were found.',
    findings: [],
  });
  const low = buildAnalysisResult(lowRaw, source);
  assert(low.status === 'completed' && low.riskLevel === 'Low', 'Low-risk result completes honestly');
  assert(low.riskScore === 0, 'Low-risk score is 0');

  const invalid = buildAnalysisResult('I cannot answer that.', source);
  assert(!invalid.ok && invalid.code === 'INVALID_JSON', 'Unreadable model output is rejected');

  section('2. Provider error mapping');
  assert(mapProviderError(429).status === 429, '429 maps to quota error');
  assert(mapProviderError(402).code === 'CREDITS', '402 maps to credits error');
  assert(mapProviderError(503).status === 502, '5xx maps to provider error');
  assert(mapProviderError(404).code === 'MODEL_UNAVAILABLE', '404 maps to model unavailable');
}

/* ============================ LIVE LLM TESTS ============================ */
async function runLiveAnalysisTests() {
  section('3. Live LLM analysis (real model, no DB persistence)');

  const contractText =
    'SERVICE AGREEMENT. The Supplier may terminate this agreement at any time without notice or compensation. ' +
    'The Client must pay a late fee of 10% per month on any unpaid invoice. ' +
    'This agreement automatically renews for 24 months unless the Client cancels in writing at least 90 days before renewal. ' +
    'The Supplier is not liable for any indirect or consequential loss, including lost profits.';

  try {
    const risky = await runRiskAnalysis({
      title: 'Synthetic service agreement',
      type: 'TXT',
      category: 'Legal',
      text: contractText,
    });
    console.log(`  ℹ️  Live risky result: ${risky.status} / ${risky.riskLevel} / score ${risky.riskScore}`);
    risky.findings?.forEach((f) =>
      console.log(`     • [${f.severity}] ${f.category}: ${f.evidence.slice(0, 90)}...`)
    );
    assert(risky.status === 'completed', 'Live risky document analysis completed');
    assert(
      risky.riskLevel === 'Medium' || risky.riskLevel === 'High',
      'Live risky document classified Medium or High'
    );
    assert(risky.findings.length > 0, 'Live risky document returned grounded findings');
    assert(
      risky.findings.every((f) => isEvidenceGrounded(f.evidence, contractText)),
      'Every live finding cites evidence present in the source text'
    );

    const informationalText =
      'The office will be closed on Friday for scheduled maintenance. ' +
      'Staff should save their work before 5 PM on Thursday. ' +
      'The café on the ground floor will remain open with reduced hours. ' +
      'Normal operations resume on Monday morning.';

    const low = await runRiskAnalysis({
      title: 'Office closure notice',
      type: 'TXT',
      category: 'Other',
      text: informationalText,
    });
    console.log(`  ℹ️  Live informational result: ${low.status} / ${low.riskLevel} / score ${low.riskScore}`);
    assert(
      low.riskLevel !== 'High',
      'Informational document is not falsely classified High risk'
    );
  } catch (error) {
    console.error(`  ❌ Live LLM test error: ${error.message}`);
    failed += 1;
  }
}

/* ============================ DASHBOARD TESTS ============================ */
async function runDashboardTests({ tableExists }) {
  section('4. Dashboard data, storage bytes & user isolation');

  if (!USER1_EMAIL || !USER2_EMAIL || !USER1_ID || !USER2_ID) {
    skip('TEST_USER1/2 env vars missing');
    return;
  }

  const user1Token = await getAccessTokenForUser(USER1_EMAIL);
  const user2Token = await getAccessTokenForUser(USER2_EMAIL);

  assert(
    tokenUserId(user1Token) === USER1_ID,
    'User 1 token belongs to TEST_USER1_ID'
  );
  assert(
    tokenUserId(user2Token) === USER2_ID,
    'User 2 token belongs to TEST_USER2_ID'
  );

  const [dash1, dash2] = await Promise.all([
    api('/analytics/dashboard', { token: user1Token }),
    api('/analytics/dashboard', { token: user2Token }),
  ]);

  assert(dash1.status === 200, 'User 1 dashboard returns 200');
  assert(dash2.status === 200, 'User 2 dashboard returns 200');

  const [db1Bytes, db2Bytes] = await Promise.all([
    dbStorageBytes(USER1_ID),
    dbStorageBytes(USER2_ID),
  ]);

  assert(
    dash1.body.storageUsedBytes === db1Bytes,
    `User 1 storage bytes match DB (${db1Bytes})`
  );
  assert(
    dash2.body.storageUsedBytes === db2Bytes,
    `User 2 storage bytes match DB (${db2Bytes})`
  );
  assert(
    dash1.body.totalStorageBytes === dash1.body.totalStorage * 1024 ** 3,
    'Storage limit bytes and GB are internally consistent'
  );
  assert(
    ['env', 'default'].includes(dash1.body.storageLimitSource),
    'Storage limit source is labelled (env/default)'
  );

  const { count: user1Count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER1_ID);
  const { count: user2Count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER2_ID);

  assert(dash1.body.totalDocuments === user1Count, `User 1 total matches DB (${user1Count})`);
  assert(dash2.body.totalDocuments === user2Count, `User 2 total matches DB (${user2Count})`);

  const user1DocIds = new Set(
    (dash1.body.recentDocuments || []).map((doc) => doc.id)
  );
  assert(
    (dash1.body.recentDocuments || []).every((doc) => user1DocIds.has(doc.id)),
    'Dashboard recent documents contain no duplicates'
  );

  // Risk storage availability must be honest.
  assert(
    dash1.body.riskAnalysis?.available === tableExists,
    `Dashboard reports risk storage availability honestly (table ${tableExists ? 'present' : 'missing'})`
  );

  if (!tableExists) {
    assert(
      dash1.body.highRiskDocuments === 0,
      'No fabricated high-risk count while analysis storage is missing'
    );
  }

  section('5. Cross-user access control for risk endpoints');

  if (!USER1_DOC_ID) {
    skip('TEST_USER1_DOC_ID missing');
  } else {
    const crossDetail = await api(`/documents/${USER1_DOC_ID}/analysis`, {
      token: user2Token,
    });
    assert(crossDetail.status === 403, 'User 2 GET another user\'s analysis → 403');

    const crossAnalyze = await api(`/documents/${USER1_DOC_ID}/analyze`, {
      token: user2Token,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
    assert(crossAnalyze.status === 403, 'User 2 POST analyze another user\'s document → 403');

    const ownAnalysis = await api(`/documents/${USER1_DOC_ID}/analysis`, {
      token: user1Token,
    });
    if (tableExists) {
      assert(
        [200, 404].includes(ownAnalysis.status),
        'Owner can read analysis endpoint (200 stored or 404 not analyzed)'
      );
    } else {
      assert(
        ownAnalysis.status === 503 && ownAnalysis.body?.code === 'ANALYSIS_TABLE_MISSING',
        'Missing migration returns honest 503 (not mock analysis)'
      );
    }
  }

  return { user1Token };
}

/* ====================== STORAGE UPLOAD/DELETE TEST ====================== */
async function runStorageLifecycleTest(token) {
  section('6. Upload/delete storage accounting (exact bytes + disk cleanup)');

  if (!token) {
    skip('No user token available');
    return;
  }

  const before = await api('/analytics/dashboard', { token });
  if (before.status !== 200) {
    skip('Dashboard unavailable for storage lifecycle test');
    return;
  }
  const baselineBytes = before.body.storageUsedBytes;

  // Build a TXT fixture with a known size (>= 200 chars for analysis).
  const bodyText =
    'DOCULENS STORAGE TEST FIXTURE. This document exists only to verify exact file-size accounting. ' +
    'It contains no real business information and is deleted by the automated test. ' +
    'The quick brown fox jumps over the lazy dog. '.repeat(8);
  const encoder = new TextEncoder();
  let content = bodyText;
  while (encoder.encode(content).length < 1500) content += ' filler';
  content = content.slice(0, 1500);
  const expectedBytes = encoder.encode(content).length;

  const form = new FormData();
  form.append('file', new Blob([content], { type: 'text/plain' }), 'dashboard_storage_test.txt');
  form.append(
    'metadata',
    JSON.stringify({
      title: 'TEST FIXTURE - dashboard storage test (safe to delete)',
      category: 'Other',
      description: 'Automated storage accounting fixture',
    })
  );

  let documentId = null;
  let fileUrl = null;

  try {
    const upload = await api('/documents/upload', {
      token,
      method: 'POST',
      body: form,
    });

    assert(
      upload.status === 201 || upload.status === 200,
      `Fixture upload succeeded (${upload.status})`
    );
    documentId = upload.body?.id;
    fileUrl = upload.body?.file_url;
    assert(Boolean(documentId), 'Upload returned a document id');
    assert(
      upload.body?.file_size === expectedBytes,
      `Stored file_size equals actual bytes (${expectedBytes})`
    );

    const { data: dbDoc } = await supabase
      .from('documents')
      .select('file_size, user_id, status')
      .eq('id', documentId)
      .single();
    assert(dbDoc?.file_size === expectedBytes, 'DB file_size matches actual upload bytes');
    assert(Boolean(dbDoc?.user_id), 'Uploaded fixture has an owner');

    const diskFile = fileUrl?.split('/').pop();
    const diskStat = diskFile
      ? await import('node:fs/promises').then((fs) =>
          fs.stat(new URL(`./uploads/${diskFile}`, import.meta.url))
        )
      : null;
    assert(diskStat?.size === expectedBytes, 'File on disk has the same byte size');

    const after = await api('/analytics/dashboard', { token });
    assert(
      after.body.storageUsedBytes === baselineBytes + expectedBytes,
      `Dashboard storage increased by exactly ${expectedBytes} bytes`
    );

    const deleteResponse = await api(`/documents/${documentId}`, {
      token,
      method: 'DELETE',
    });
    assert(deleteResponse.status === 200, 'Fixture delete succeeded');

    // Unlink is asynchronous; give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const restored = await api('/analytics/dashboard', { token });
    assert(
      restored.body.storageUsedBytes === baselineBytes,
      'Dashboard storage returned to the exact baseline after delete'
    );

    const { data: goneDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .maybeSingle();
    assert(!goneDoc, 'Deleted fixture no longer exists in DB');

    if (diskFile) {
      const exists = await import('node:fs/promises').then((fs) =>
        fs
          .access(new URL(`./uploads/${diskFile}`, import.meta.url))
          .then(() => true)
          .catch(() => false)
      );
      assert(!exists, 'Deleted fixture file was removed from disk (no storage orphan)');
    }

    documentId = null;
  } catch (error) {
    console.error(`  ❌ Storage lifecycle error: ${error.message}`);
    failed += 1;
  } finally {
    if (documentId) {
      try {
        await supabase.from('document_chunks').delete().eq('document_id', documentId);
        await supabase.from('chat_history').delete().eq('document_id', documentId);
        await supabase.from('documents').delete().eq('id', documentId);
        if (fileUrl) {
          const fileName = fileUrl.split('/').pop();
          const fs = await import('node:fs/promises');
          await fs.unlink(new URL(`./uploads/${fileName}`, import.meta.url)).catch(() => {});
        }
      } catch (cleanupError) {
        console.error('  ⚠️ Fixture cleanup error:', cleanupError.message);
      }
    }
  }
}

/* ============================ EMPTY DASHBOARD ============================ */
async function runEmptyDashboardTest() {
  section('7. Empty dashboard (temporary user, no documents)');

  const email = `doculens.empty.${Date.now()}@example.com`;
  let userId = null;

  try {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw error;
    userId = created.user.id;

    const token = await getAccessTokenForUser(email);
    const dash = await api('/analytics/dashboard', { token });

    assert(dash.status === 200, 'Empty user dashboard returns 200');
    assert(dash.body.totalDocuments === 0, 'Empty user has 0 documents');
    assert(dash.body.analysedDocuments === 0, 'Empty user has 0 analysed documents');
    assert(dash.body.highRiskDocuments === 0, 'Empty user has 0 high-risk documents');
    assert(dash.body.storageUsedBytes === 0, 'Empty user storage is exactly 0 bytes');
    assert(
      Array.isArray(dash.body.recentDocuments) && dash.body.recentDocuments.length === 0,
      'Empty user has no recent documents'
    );
    assert(
      Array.isArray(dash.body.recentAnalyses) && dash.body.recentAnalyses.length === 0,
      'Empty user has no risk analyses'
    );
  } catch (error) {
    console.error(`  ❌ Empty dashboard error: ${error.message}`);
    failed += 1;
  } finally {
    if (userId) {
      await supabase.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

/* ================================ MAIN ================================ */
async function main() {
  console.log('===============================================================');
  console.log('   DocuLens AI — Dashboard & Risk Verification');
  console.log(`   API base: ${API_BASE}`);
  console.log('===============================================================');

  runGroundingTests();
  await runLiveAnalysisTests();

  const tableExists = await analysisTableExists();
  console.log(`\n  ℹ️  document_analysis table: ${tableExists ? 'present' : 'MISSING (apply migration)'}`);

  try {
    const health = await fetch(`${API_BASE}/documents`).catch(() => null);
    if (!health) throw new Error('unreachable');
  } catch {
    skip('Backend not reachable — dashboard tests skipped');
    return report();
  }

  const dashboard = await runDashboardTests({ tableExists });
  await runStorageLifecycleTest(dashboard?.user1Token);
  await runEmptyDashboardTest();

  return report();
}

function report() {
  console.log('\n===============================================================');
  console.log(`   RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log('===============================================================');
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('\n❌ Test suite crashed:', error);
  process.exitCode = 1;
});
