import { supabase } from '../config/db.js';

export const getDashboardStats = async (req, res) => {
  try {
   
    // 🔒 Scoped strictly to authenticated user, newest first
    const { data: allDocuments, error: allError } = await supabase
      .from('documents')
      .select('id, status, file_size, created_at, title, type, category, description, user_id')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (allError) throw allError;

    const totalDocuments = allDocuments.length;
    const analysedDocuments = allDocuments.filter(d => d.status === 'analysed').length;
    const highRiskDocuments = allDocuments.filter(d => d.status === 'high-risk').length;
    const pendingDocuments = allDocuments.filter(d => d.status === 'pending').length;

    const storageUsed = allDocuments.reduce((t, d) => t + (d.file_size || 0), 0);
    const storageUsedGB = +(storageUsed / (1024 ** 3)).toFixed(2);

    // 📈 Real month-over-month growth from created_at (no hardcoded values)
    const now = new Date();
    const thisMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const createdAtMs = (d) => parseDbDate(d.created_at).getTime();
    const thisMonthUploads = allDocuments.filter(d => createdAtMs(d) >= thisMonthStart).length;
    const lastMonthUploads = allDocuments.filter(
      d => createdAtMs(d) >= lastMonthStart && createdAtMs(d) < thisMonthStart
    ).length;
    const growthPercent =
      lastMonthUploads > 0
        ? Math.round(((thisMonthUploads - lastMonthUploads) / lastMonthUploads) * 100)
        : thisMonthUploads > 0 ? 100 : 0;

    const recentDocuments = allDocuments.slice(0, 5).map(doc => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      category: doc.category,
      status: doc.status,
      date: doc.created_at,
      description: doc.description || 'No description'
    }));

    const recentActivity = recentDocuments.map(doc => ({
      id: `activity-${doc.id}`,
      user: req.user?.email || 'User',
      type: 'upload',
      document: doc.title,
      status: doc.status,
      timestamp: doc.date, // raw DB created_at (single source of truth)
      time: getRelativeTime(doc.date)
    }));

    res.json({
      totalDocuments,
      analysedDocuments,
      highRiskDocuments,
      pendingDocuments,
      storageUsed: storageUsedGB,
      totalStorage: 10,
      monthlyGrowth: {
        thisMonth: thisMonthUploads,
        lastMonth: lastMonthUploads,
        percent: growthPercent,
      },
      recentActivity,
      recentDocuments
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      message: 'Failed to fetch dashboard stats',
      totalDocuments: 0,
      analysedDocuments: 0,
      highRiskDocuments: 0,
      pendingDocuments: 0,
      storageUsed: 0,
      totalStorage: 10,
      recentActivity: [],
      recentDocuments: []
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

    const storageUsedBytes = (data || []).reduce((sum, d) => sum + (d.file_size || 0), 0);
    const usedGB = +(storageUsedBytes / (1024 ** 3)).toFixed(2);
    const totalGB = 10;
    const percentage = Math.min(100, Math.round((usedGB / totalGB) * 100));
    const available = +(totalGB - usedGB).toFixed(2);

    return res.json({
      used: usedGB,
      total: totalGB,
      percentage,
      available,
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
