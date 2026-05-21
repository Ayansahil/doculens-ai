import { supabase } from '../config/db.js';
import * as riskService from '../services/risk.service.js';

const DEFAULT_STORAGE_LIMIT_GB = 10;

/**
 * Storage limit is an application-level limit, not a hosting quota.
 * Configure with STORAGE_LIMIT_GB; otherwise the documented default is used
 * and clearly labelled as such in the dashboard.
 */
function getStorageLimit() {
  const configured = Number(process.env.STORAGE_LIMIT_GB);
  const limitGb =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_STORAGE_LIMIT_GB;

  return {
    limitGb,
    limitBytes: Math.round(limitGb * 1024 ** 3),
    source: Number.isFinite(configured) && configured > 0 ? 'env' : 'default',
  };
}

const analysisSummary = (analysis) =>
  analysis
    ? {
        status: analysis.status,
        level: analysis.risk_level,
        score: analysis.risk_score,
        summary: analysis.summary,
        error: analysis.error,
        analyzedAt: analysis.analyzed_at,
      }
    : { status: 'not_analyzed' };

export const getDashboardStats = async (req, res) => {
  try {
    // 🔒 Scoped strictly to authenticated user, newest first
    const { data: allDocuments, error: allError } = await supabase
      .from('documents')
      .select('id, status, file_size, created_at, title, type, category, description, user_id')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (allError) throw allError;

    const documents = allDocuments || [];
    const totalDocuments = documents.length;
    const analysedDocuments = documents.filter(d => d.status === 'analysed').length;
    const pendingDocuments = documents.filter(d => d.status === 'pending').length;
    const failedDocuments = documents.filter(d => d.status === 'failed').length;

    // 🧠 Stored risk analysis (never run analysis from a dashboard request)
    const analyses = await riskService.getAnalysesForDocuments(
      documents.map(d => d.id),
      req.user.id
    );

    const riskCounts = {
      completed: 0,
      high: 0,
      medium: 0,
      low: 0,
      unableToDetermine: 0,
      pending: 0,
      failed: 0,
    };

    for (const doc of documents) {
      const analysis = analyses.map[doc.id];
      if (!analysis) {
        riskCounts.pending += 1;
        continue;
      }
      if (analysis.status === 'processing' || analysis.status === 'pending') {
        riskCounts.pending += 1;
      } else if (analysis.status === 'failed') {
        riskCounts.failed += 1;
      } else if (analysis.status === 'insufficient_evidence') {
        riskCounts.completed += 1;
        riskCounts.unableToDetermine += 1;
      } else if (analysis.status === 'completed') {
        riskCounts.completed += 1;
        if (analysis.risk_level === 'High') riskCounts.high += 1;
        else if (analysis.risk_level === 'Medium') riskCounts.medium += 1;
        else if (analysis.risk_level === 'Low') riskCounts.low += 1;
        else riskCounts.unableToDetermine += 1;
      }
    }

    // 📦 Exact original-file bytes from trusted upload metadata
    const storageUsedBytes = documents.reduce((t, d) => t + (Number(d.file_size) || 0), 0);
    const storageUsedGB = +(storageUsedBytes / (1024 ** 3)).toFixed(2);
    const limit = getStorageLimit();
    const storagePercentage = limit.limitBytes > 0
      ? Math.min(100, Math.round((storageUsedBytes / limit.limitBytes) * 100))
      : 0;

    // 📈 Real month-over-month growth from created_at (no hardcoded values)
    const now = new Date();
    const thisMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const createdAtMs = (d) => parseDbDate(d.created_at).getTime();
    const thisMonthUploads = documents.filter(d => createdAtMs(d) >= thisMonthStart).length;
    const lastMonthUploads = documents.filter(
      d => createdAtMs(d) >= lastMonthStart && createdAtMs(d) < thisMonthStart
    ).length;
    const growthPercent =
      lastMonthUploads > 0
        ? Math.round(((thisMonthUploads - lastMonthUploads) / lastMonthUploads) * 100)
        : thisMonthUploads > 0 ? 100 : 0;

    const recentDocuments = documents.slice(0, 5).map(doc => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      category: doc.category,
      status: doc.status,
      file_size: Number(doc.file_size) || 0,
      date: doc.created_at,
      description: doc.description || 'No description',
      risk: analysisSummary(analyses.map[doc.id]),
    }));

    const recentAnalyses = documents
      .map(doc => {
        const analysis = analyses.map[doc.id];
        if (!analysis) return null;
        return {
          documentId: doc.id,
          title: doc.title,
          type: doc.type,
          fileSize: Number(doc.file_size) || 0,
          status: analysis.status,
          riskLevel: analysis.risk_level,
          riskScore: analysis.risk_score,
          summary: analysis.summary,
          findings: Array.isArray(analysis.findings) ? analysis.findings : [],
          coverage: analysis.coverage || {},
          error: analysis.error,
          analyzedAt: analysis.analyzed_at,
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    const recentActivity = recentDocuments.map(doc => ({
      id: `activity-${doc.id}`,
      user: req.user?.email || 'User',
      type: 'upload',
      document: doc.title,
      status: doc.status,
      timestamp: doc.date, // raw DB created_at (single source of truth)
      time: getRelativeTime(doc.date),
    }));

    res.json({
      totalDocuments,
      analysedDocuments,
      highRiskDocuments: riskCounts.high,
      pendingDocuments,
      failedDocuments,
      // Compatibility field (GB, rounded) + exact bytes for display
      storageUsed: storageUsedGB,
      storageUsedBytes,
      totalStorage: limit.limitGb,
      totalStorageBytes: limit.limitBytes,
      storagePercentage,
      storageLimitSource: limit.source,
      monthlyGrowth: {
        thisMonth: thisMonthUploads,
        lastMonth: lastMonthUploads,
        percent: growthPercent,
      },
      riskAnalysis: {
        available: analyses.available,
        error: analyses.error || null,
        ...riskCounts,
      },
      riskDisclaimer: riskService.RISK_DISCLAIMER,
      recentActivity,
      recentDocuments,
      recentAnalyses,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    // Never send fabricated fallback statistics.
    res.status(500).json({
      message: 'Failed to fetch dashboard stats',
      error: error.message,
    });
  }
};

export const getStorageInfo = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('file_size')
      .eq('user_id', req.user.id);

    if (error) throw error;

    const usedBytes = (data || []).reduce((sum, d) => sum + (Number(d.file_size) || 0), 0);
    const limit = getStorageLimit();
    const percentage = limit.limitBytes > 0
      ? Math.min(100, Math.round((usedBytes / limit.limitBytes) * 100))
      : 0;

    return res.json({
      used: +(usedBytes / (1024 ** 3)).toFixed(2),
      usedBytes,
      total: limit.limitGb,
      totalBytes: limit.limitBytes,
      totalSource: limit.source,
      percentage,
      available: +((limit.limitBytes - usedBytes) / (1024 ** 3)).toFixed(2),
      availableBytes: Math.max(0, limit.limitBytes - usedBytes),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch storage info', error: error.message });
  }
};

function getRelativeTime(dateString) {
  const date = parseDbDate(dateString);
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff) || diff < 60000) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

// DB stores created_at as UTC without a timezone suffix. JavaScript would
// otherwise parse it as LOCAL time and skew every relative time by the
// timezone offset — so append 'Z' (UTC) when no offset is present.
function parseDbDate(value) {
  const s = String(value);
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`);
}
