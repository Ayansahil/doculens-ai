import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  TrendingUp,
  TriangleAlert as AlertTriangle,
  Clock,
  Users,
  Database,
  Activity,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { useApp } from "../../context/AppContext";
import {
  formatDate,
  formatFileSize,
  getRiskBadge,
  getStatusBadgeVariant,
  RISK_DISCLAIMER_TEXT,
} from "../../utils/helpers";
import { api } from "../../services/api";

const severityVariant = (severity) => {
  if (severity === "high") return "high-risk";
  if (severity === "medium") return "warning";
  return "success";
};

const Dashboard = () => {
  const { dashboardStats, setDashboardStats } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const navigate = useNavigate();

  const fetchDashboardStats = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      try {
        const response = await api.getDashboardStats();
        setDashboardStats(response.data);
        setError(null);
      } catch (fetchError) {
        console.error("Failed to fetch dashboard stats:", fetchError);
        // Never substitute fabricated statistics; keep the last real data
        // (if any) and surface the error.
        setError(
          fetchError.response?.data?.message ||
            fetchError.message ||
            "Failed to load dashboard statistics."
        );
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [setDashboardStats]
  );

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  const hasRunningAnalysis = Boolean(
    dashboardStats?.recentAnalyses?.some(
      (analysis) =>
        analysis.status === "processing" || analysis.status === "pending"
    )
  );

  // Refresh while an analysis is running so the dashboard reflects completion.
  useEffect(() => {
    if (!hasRunningAnalysis) return undefined;
    const timer = setInterval(
      () => fetchDashboardStats({ silent: true }),
      5000
    );
    return () => clearInterval(timer);
  }, [hasRunningAnalysis, fetchDashboardStats]);

  // Refresh when the user returns to the tab (e.g. after an upload/delete).
  useEffect(() => {
    const onFocus = () => fetchDashboardStats({ silent: true });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboardStats]);

  const runAnalysis = async (documentId) => {
    setRunningId(documentId);
    setActionError(null);
    try {
      await api.analyzeDocumentRisk(documentId, true);
      await fetchDashboardStats({ silent: true });
    } catch (analysisError) {
      setActionError(
        analysisError.response?.data?.message ||
          analysisError.message ||
          "Risk analysis failed. Please try again."
      );
    } finally {
      setRunningId(null);
    }
  };

  if (loading && !dashboardStats) {
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
  const growth = stats.monthlyGrowth;
  const storageBytes =
    typeof stats.storageUsedBytes === "number"
      ? stats.storageUsedBytes
      : Math.round((stats.storageUsed || 0) * 1024 ** 3);
  const storagePercentage =
    typeof stats.storagePercentage === "number"
      ? stats.storagePercentage
      : stats.totalStorage
        ? Math.min(100, Math.round((stats.storageUsed / stats.totalStorage) * 100))
        : 0;
  const riskCounts = stats.riskAnalysis || {};
  const recentAnalyses = stats.recentAnalyses || [];
  const analysisAvailable = riskCounts.available !== false;

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            Dashboard data could not be refreshed: {error}
            {dashboardStats
              ? " Showing the last successfully loaded data."
              : ""}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchDashboardStats()}
          >
            Retry
          </Button>
        </div>
      )}

      {actionError && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">{actionError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActionError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Documents</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.totalDocuments?.toLocaleString() ?? "0"}
              </p>
            </div>
            <div className="h-12 w-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="flex items-center mt-4">
            {growth?.lastMonth > 0 ? (
              <>
                <TrendingUp
                  className={`h-4 w-4 mr-1 ${
                    growth.percent >= 0 ? "text-green-500" : "text-red-500 rotate-180"
                  }`}
                />
                <span
                  className={`text-sm ${
                    growth.percent >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {growth.percent >= 0 ? "+" : ""}
                  {growth.percent}% from last month
                </span>
              </>
            ) : (
              <span className="text-sm text-gray-600">
                {growth?.thisMonth > 0
                  ? `${growth.thisMonth} upload${growth.thisMonth === 1 ? "" : "s"} this month`
                  : "No uploads yet this month"}
              </span>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Analysed</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats.analysedDocuments?.toLocaleString() ?? "0"}
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
                {stats.highRiskDocuments ?? "0"}
              </p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </div>
          <div className="flex items-center mt-4">
            <span
              className={`text-sm ${
                stats.highRiskDocuments > 0 ? "text-orange-600" : "text-gray-600"
              }`}
            >
              {!analysisAvailable
                ? "Risk analysis storage not initialized"
                : stats.highRiskDocuments > 0
                  ? "AI-flagged · review recommended"
                  : "No high-risk findings"}
            </span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Storage Used</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatFileSize(storageBytes)}
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
              {Math.round(storagePercentage)}% of {stats.totalStorage ?? 0} GB
              application limit
              {stats.storageLimitSource === "default" ? " (default)" : ""}
            </span>
          </div>
        </Card>
      </div>

      {/* Risk Analysis */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-orange-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Document Risk Analysis
              </h3>
              <Badge variant="warning" size="sm">
                AI advisory
              </Badge>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Findings are grounded in the document text; evidence is shown
              separately from AI interpretation.
            </p>
          </div>
          {riskCounts.completed > 0 && (
            <p className="text-xs text-gray-500">
              {riskCounts.high} high · {riskCounts.medium} medium ·{" "}
              {riskCounts.low} low · {riskCounts.unableToDetermine} undetermined
            </p>
          )}
        </div>

        {!analysisAvailable ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Risk analysis storage is not initialized. Apply{" "}
              <code className="rounded bg-white px-1 py-0.5 text-xs">
                backend/supabase_risk_analysis_migration.sql
              </code>{" "}
              in the Supabase SQL Editor to enable real, persisted risk
              analysis. No placeholder risk data is shown.
            </p>
          </div>
        ) : recentAnalyses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <ShieldAlert size={44} className="mx-auto mb-2 opacity-50" />
            <p>No risk analysis has been run yet.</p>
            <p className="text-xs mt-1">
              Analysis runs automatically after a successful upload, or you can
              start it from a document.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigate("/documents")}
            >
              Go to Documents
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {recentAnalyses.map((analysis) => {
              const badge = getRiskBadge({
                status: analysis.status,
                level: analysis.riskLevel,
              });
              const isRunning =
                analysis.status === "processing" ||
                analysis.status === "pending";
              const canRun =
                analysis.status === "failed" ||
                analysis.status === "insufficient_evidence" ||
                analysis.status === "completed";

              return (
                <div
                  key={analysis.documentId}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-medium text-gray-900 truncate">
                        {analysis.title}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {analysis.type} · {formatFileSize(analysis.fileSize)}
                        {analysis.analyzedAt
                          ? ` · analyzed ${formatDate(analysis.analyzedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={badge.variant} size="sm">
                        {badge.label}
                      </Badge>
                      {typeof analysis.riskScore === "number" && (
                        <span
                          className="text-xs text-gray-500"
                          title="Heuristic score: High finding = 30, Medium = 15, Low = 5, capped at 100"
                        >
                          Score {analysis.riskScore}/100
                        </span>
                      )}
                    </div>
                  </div>

                  {isRunning ? (
                    <p className="mt-3 text-sm text-blue-700">
                      Analysis in progress. This can take up to a minute.
                    </p>
                  ) : analysis.status === "failed" ? (
                    <p className="mt-3 text-sm text-red-700">
                      {analysis.error ||
                        "The analysis failed. The document was not marked as analysed."}
                    </p>
                  ) : analysis.status === "insufficient_evidence" ? (
                    <p className="mt-3 text-sm text-gray-600">
                      {analysis.summary ||
                        "Unable to determine: not enough verifiable evidence in the document text."}
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-sm text-gray-700">
                        {analysis.summary}
                      </p>

                      {analysis.findings?.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {analysis.findings.map((finding, index) => (
                            <div
                              key={`${analysis.documentId}-${index}`}
                              className="border-l-2 border-orange-300 pl-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={severityVariant(finding.severity)}
                                  size="sm"
                                >
                                  {finding.category}
                                </Badge>
                                <span className="text-xs uppercase tracking-wide text-gray-500">
                                  {finding.severity} severity
                                </span>
                              </div>
                              <blockquote className="mt-2 rounded bg-gray-50 p-2 text-xs italic text-gray-700">
                                “{finding.evidence}”
                              </blockquote>
                              <p className="mt-2 text-xs text-gray-700">
                                <span className="font-medium">
                                  AI interpretation:
                                </span>{" "}
                                {finding.explanation}
                              </p>
                              {finding.recommendation && (
                                <p className="mt-1 text-xs text-gray-600">
                                  <span className="font-medium">
                                    Suggested human review:
                                  </span>{" "}
                                  {finding.recommendation}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">
                          No specific grounded risk indicators were found.
                        </p>
                      )}

                      {analysis.coverage?.truncated && (
                        <p className="mt-2 text-xs text-amber-700">
                          Only the first{" "}
                          {analysis.coverage.analyzedCharacters?.toLocaleString()}{" "}
                          of{" "}
                          {analysis.coverage.totalCharacters?.toLocaleString()}{" "}
                          characters were analyzed to stay within the model
                          limit.
                        </p>
                      )}
                    </>
                  )}

                  {canRun && !isRunning && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      loading={runningId === analysis.documentId}
                      disabled={runningId === analysis.documentId}
                      onClick={() => runAnalysis(analysis.documentId)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {analysis.status === "completed" ||
                      analysis.status === "insufficient_evidence"
                        ? "Re-run analysis"
                        : "Retry analysis"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-4">{RISK_DISCLAIMER_TEXT}</p>
      </Card>

      {/* Recent Activity and Documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/documents")}
            >
              View All
            </Button>
          </div>

          <div className="space-y-4">
            {stats.recentActivity?.length ? (
              stats.recentActivity.map((activity) => (
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
                      {activity.type === "upload" ? "uploaded" : activity.type}{" "}
                      <span className="font-medium">{activity.document}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={getStatusBadgeVariant(activity.status)}
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
              ))
            ) : (
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/documents")}
            >
              View All
            </Button>
          </div>

          <div className="space-y-4">
            {stats.recentDocuments?.length ? (
              stats.recentDocuments.map((document) => {
                const riskBadge = getRiskBadge(document.risk);
                const canRunAnalysis =
                  analysisAvailable &&
                  ["not_analyzed", "failed"].includes(
                    document.risk?.status || "not_analyzed"
                  );

                return (
                  <div
                    key={document.id}
                    className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {document.title}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {document.type} / {document.category} ·{" "}
                            {formatFileSize(document.file_size)}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={getStatusBadgeVariant(document.status)}
                        size="sm"
                      >
                        {document.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {document.description}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={riskBadge.variant} size="sm">
                          {riskBadge.label}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {formatDate(document.date)}
                        </span>
                      </div>
                      {canRunAnalysis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={runningId === document.id}
                          disabled={runningId === document.id}
                          onClick={() => runAnalysis(document.id)}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {document.risk?.status === "failed"
                            ? "Retry analysis"
                            : "Analyze risk"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
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
