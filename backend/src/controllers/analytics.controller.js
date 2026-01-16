import { supabase } from '../config/db.js';

export const getDashboardStats = async (req, res) => {
  try {
    // 🔴 TEMP MOCK DATA (REMOVE AFTER UI TEST)
    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        totalDocuments: 5,
        analysedDocuments: 3,
        highRiskDocuments: 1,
        pendingDocuments: 2,
        storageUsed: 1.5,
        totalStorage: 10,
        recentActivity: [
          {
            id: 'activity-1',
            user: 'Ayan',
            type: 'upload',
            document: 'Sample Contract',
            status: 'Analysed',
            time: 'Just now'
          }
        ],
        recentDocuments: [
          {
            id: 1,
            title: 'Sample Contract',
            type: 'PDF',
            category: 'Legal',
            status: 'High Risk',
            date: new Date().toISOString(),
            description: 'Mock data for UI testing'
          }
        ]
      });
    }

    // 🟢 REAL DATABASE LOGIC (PRODUCTION)
    const { data: allDocuments, error: allError } = await supabase
      .from('documents')
      .select('id, status, file_size, created_at, title, type, category, description');

    if (allError) throw allError;

    const totalDocuments = allDocuments.length;
    const analysedDocuments = allDocuments.filter(d => d.status === 'analysed').length;
    const highRiskDocuments = allDocuments.filter(d => d.status === 'high-risk').length;
    const pendingDocuments = allDocuments.filter(d => d.status === 'pending').length;

    const storageUsed = allDocuments.reduce((t, d) => t + (d.file_size || 0), 0);
    const storageUsedGB = +(storageUsed / (1024 ** 3)).toFixed(2);

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
      user: 'System',
      type: 'upload',
      document: doc.title,
      status: doc.status,
      time: getRelativeTime(doc.date)
    }));

    res.json({
      totalDocuments,
      analysedDocuments,
      highRiskDocuments,
      pendingDocuments,
      storageUsed: storageUsedGB,
      totalStorage: 10,
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
  return res.json({
    used: 1.5,
    total: 10,
    percentage: 15,
    available: 8.5
  });
};

function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} mins ago`;
  return `${Math.floor(mins / 60)} hours ago`;
}
