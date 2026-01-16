import { useState, useEffect } from "react";
import {
  FileText,
  TrendingUp,
  TriangleAlert as AlertTriangle,
  Clock,
  Users,
  Database,
  Activity,
} from "lucide-react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useApp } from "../../context/AppContext";
import { formatDate } from "../../utils/helpers";
import {api} from "../../services/api";

const Dashboard = () => {
  const { dashboardStats, setDashboardStats } = useApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await api.getDashboardStats();
        setDashboardStats(response.data);
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error);
        // fallback (optional)
        setDashboardStats({
          totalDocuments: 0,
          analysedDocuments: 0,
          highRiskDocuments: 0,
          pendingDocuments: 0,
          storageUsed: 0,
          totalStorage: 10,
          recentActivity: [],
          recentDocuments: [],
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, [setDashboardStats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const stats = dashboardStats || {};
  const storagePercentage = stats.totalStorage
    ? (stats.storageUsed / stats.totalStorage) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalDocuments?.toLocaleString()}
              </p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="flex items-center mt-4">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-sm text-green-600">+12% from last month</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Analysed</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.analysedDocuments?.toLocaleString()}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center mt-4">
            <span className="text-sm text-gray-600">
              {stats.totalDocuments
                ? Math.round(
                    (stats.analysedDocuments / stats.totalDocuments) * 100
                  )
                : 0}
              % completion rate
            </span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">High Risk</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.highRiskDocuments}
              </p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <div className="flex items-center mt-4">
            <span className="text-sm text-orange-600">Requires attention</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Storage Used</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.storageUsed}GB
              </p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Database className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${storagePercentage}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 mt-1">
              {Math.round(storagePercentage)}% of {stats.totalStorage}GB
            </span>
          </div>
        </Card>
      </div>

      {/* Recent Activity and Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h3>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </div>

          <div className="space-y-4">
            {stats.recentActivity?.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50"
              >
                <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center">
                  {activity.type === "upload" && (
                    <FileText size={16} className="text-blue-500" />
                  )}
                  {activity.type === "analysis" && (
                    <Activity size={16} className="text-green-500" />
                  )}
                  {activity.type === "share" && (
                    <Users size={16} className="text-purple-500" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{activity.user}</span>{" "}
                    {activity.type}ed{" "}
                    <span className="font-medium">{activity.document}</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge
                      variant={activity.status.toLowerCase().replace(" ", "-")}
                      size="sm"
                    >
                      {activity.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {activity.time}
                    </span>
                  </div>
                </div>
              </div>
            )) || (
              <div className="text-center py-8 text-gray-500">
                <Clock size={48} className="mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
              </div>
            )}
          </div>
        </Card>

        {/* Recent Documents */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Documents
            </h3>
            <Button variant="ghost" size="sm">
              View All
            </Button>
          </div>

          <div className="space-y-4">
            {stats.recentDocuments?.map((document) => (
              <div
                key={document.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 bg-red-100 rounded flex items-center justify-center">
                      <FileText size={16} className="text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {document.title}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {document.type} / {document.category}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={document.status.toLowerCase().replace(" ", "-")}
                    size="sm"
                  >
                    {document.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {document.description}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(document.date)}
                </p>
              </div>
            )) || (
              <div className="text-center py-8 text-gray-500">
                <FileText size={48} className="mx-auto mb-2 opacity-50" />
                <p>No documents yet</p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
