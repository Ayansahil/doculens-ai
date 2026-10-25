import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  FileText,
  Sparkles,
  MessageSquare,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import Card from "../ui/Card";
import PropTypes from "prop-types";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Badge from "../ui/Badge";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import {
  getRiskBadge,
  RISK_DISCLAIMER_TEXT,
} from "../../utils/helpers";

const isUserMessage = (m) => m?.role === "user" || m?.type === "user";

const severityVariant = (severity) => {
  if (severity === "high") return "high-risk";
  if (severity === "medium") return "warning";
  return "success";
};

const ChatBot = ({
  documentId = null,
  selectedDocument = null,
  summary = null,
  summaryLoading = false,
  riskAnalysis = null,
  analysisLoading = false,
  analysisError = null,
  onAnalyzeRisk = null,
  className = "",
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState("chatbot");

  const messagesEndRef = useRef();
  const { addNotification } = useApp();

  const suggestedPrompts = [
    "Summarize key points",
    "What is this document about?",
    "Translate to Spanish?",
    "What are the main risks?",
    "Extract key data",
    "Find inconsistencies",
    "Generate report",
  ];

  /* ===============================
     INIT MESSAGE & HISTORY SYNC
  ================================ */
  useEffect(() => {
    let isMounted = true;

    const syncMessages = async () => {
      if (documentId) {
        try {
          const res = await api.getChatHistory(documentId);
          if (!isMounted) return;
          if (res.data?.history && res.data.history.length > 0) {
            const seenIds = new Set();
            const loaded = [];
            for (const h of res.data.history) {
              if (!h) continue;
              const id = h.id || `hist-${seenIds.size}-${Date.now()}`;
              if (seenIds.has(id)) continue;
              seenIds.add(id);

              const isUser = isUserMessage(h);
              loaded.push({
                id,
                role: isUser ? "user" : (h.role || "bot"),
                type: isUser ? "user" : "bot",
                content: h.content,
                timestamp: h.timestamp || new Date().toISOString(),
              });
            }
            setMessages(loaded);
            return;
          }
        } catch (err) {
          console.warn("Could not fetch chat history:", err);
        }
      }

      if (isMounted) {
        setMessages([
          {
            id: "init",
            role: "bot",
            type: "bot",
            content: documentId
              ? `I'm ready to help you analyze ${selectedDocument?.title ? `"${selectedDocument.title}"` : "this document"}. What would you like to know?`
              : "Please select a document from the list to start asking questions.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    };

    syncMessages();

    return () => {
      isMounted = false;
    };
  }, [documentId, selectedDocument?.title]);

  /* ===============================
     SCROLL CHAT
  ================================ */
  useEffect(() => {
    // 💡 SCROLL FIX: Use a more robust scroll to handle smooth rendering
    const scrollToBottom = () => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    };

    // Multiple triggers for reliability
    scrollToBottom();
    const timer = setTimeout(scrollToBottom, 200);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  /* ===============================
     SEND CHAT MESSAGE
  ================================ */
  const handleSendMessage = async () => {
    if (isTyping || !inputMessage.trim()) return;

    // If no document is selected, show a clear UI message asking the user to select one
    if (!documentId) {
      const selectMsg = "Please select a document from the list before asking questions.";
      const now = Date.now();
      const userMsg = {
        id: `user-${now}`,
        role: "user",
        type: "user",
        content: inputMessage.trim(),
        timestamp: new Date().toISOString(),
      };
      const botMsg = {
        id: `bot-${now + 1}`,
        role: "bot",
        type: "bot",
        content: `⚠️ ${selectMsg}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, botMsg]);
      setInputMessage("");
      addNotification({ type: "warning", message: selectMsg });
      return;
    }

    const userMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      type: "user",
      content: inputMessage.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => {
      if (prev.some((m) => m.id === userMessage.id)) return prev;
      return [...prev, userMessage];
    });
    setInputMessage("");
    setIsTyping(true);

    try {
      const response = await api.sendChatMessage(userMessage.content, documentId);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || "Failed to get response");
      }

      // Safely extract bot content from any expected response shape
      const botContent =
        data.botMessage?.content ||
        data.response?.content ||
        data.message ||
        data.content ||
        "I could not generate a response.";

      const botId = data.botMessage?.id || `bot-${Date.now()}`;
      const botTimestamp = data.botMessage?.timestamp || new Date().toISOString();
      const botRole = data.botMessage?.role === "assistant" ? "assistant" : "bot";

      const botMessage = {
        id: botId,
        role: botRole,
        type: "bot",
        content: botContent,
        timestamp: botTimestamp,
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === botId)) return prev;
        return [...prev, botMessage];
      });
    } catch (error) {
      let errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        "Failed to process chat";

      if (
        error.response?.status === 429 ||
        /429|quota|rate limit|free-models-per-day/i.test(errorMsg)
      ) {
        errorMsg =
          "The free AI request limit has been reached. Please try again after the quota resets.";
      } else if (
        error.code === "ECONNABORTED" ||
        /timeout of \d+ms/i.test(errorMsg)
      ) {
        errorMsg =
          "The AI took longer than usual to respond. Please try again.";
      } else if (!error.response) {
        errorMsg =
          "Cannot reach the server. Please check that the backend is running and try again.";
      }

      const errorBotId = `bot-err-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: errorBotId,
          role: "bot",
          type: "bot",
          content: `⚠️ ${errorMsg}`,
          timestamp: new Date().toISOString(),
        },
      ]);

      addNotification({ type: "error", message: errorMsg });
    } finally {
      setIsTyping(false);
    }
  };

  const handleSuggestedPrompt = (prompt) => {
    setInputMessage(prompt);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /* ===============================
     UI
  ================================ */
  return (
    <Card className={`h-full min-h-0 min-w-0 flex flex-col ${className}`} padding="none">
      {/* Tabs */}
      <div className="flex min-w-0 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("structured")}
          className={`min-w-0 flex-1 px-2 py-3 text-xs font-medium border-b-2 sm:px-4 sm:text-sm ${activeTab === "structured"
            ? "border-primary-500 text-primary-600"
            : "border-transparent text-gray-500"
            }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={16} className="shrink-0" />
            <span className="min-w-0 break-words">Structured Data Output</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab("chatbot")}
          className={`min-w-0 flex-1 px-2 py-3 text-xs font-medium border-b-2 sm:px-4 sm:text-sm ${activeTab === "chatbot"
            ? "border-primary-500 text-primary-600"
            : "border-transparent text-gray-500"
            }`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <MessageSquare size={16} className="shrink-0" />
            <span>Chatbot</span>
            {documentId ? (
              <Badge variant="success" size="sm" className="ml-1 scale-75 origin-left">
                Context ON
              </Badge>
            ) : (
              <Badge variant="warning" size="sm" className="ml-1 scale-75 origin-left">
                No Document
              </Badge>
            )}
          </div>
        </button>
      </div>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === "structured" ? (
          <div className="h-full min-w-0 space-y-6 overflow-y-auto p-4">
            {!documentId ? (
              <p className="text-gray-500 text-center">
                Select a document to see its summary and risk analysis.
              </p>
            ) : (
              <>
                {/* SUMMARY */}
                <div>
                  <h3 className="font-semibold mb-2">Document Summary</h3>
                  {summaryLoading ? (
                    <p className="text-gray-500">Generating summary...</p>
                  ) : summary ? (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {summary}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No summary available for this document.
                    </p>
                  )}
                </div>

                {/* RISK ANALYSIS */}
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-semibold">Risk Analysis</h3>
                    {riskAnalysis && (
                      <Badge
                        variant={
                          getRiskBadge({
                            status: riskAnalysis.status,
                            level: riskAnalysis.risk_level,
                          }).variant
                        }
                        size="sm"
                      >
                        {
                          getRiskBadge({
                            status: riskAnalysis.status,
                            level: riskAnalysis.risk_level,
                          }).label
                        }
                      </Badge>
                    )}
                  </div>

                  {analysisLoading ? (
                    <p className="text-sm text-blue-700">
                      Loading stored risk analysis...
                    </p>
                  ) : analysisError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm text-red-700">{analysisError}</p>
                      {onAnalyzeRisk && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={onAnalyzeRisk}
                        >
                          <RefreshCw size={14} />
                          Retry analysis
                        </Button>
                      )}
                    </div>
                  ) : !riskAnalysis ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm text-gray-600">
                        No risk analysis has been run for this document yet.
                      </p>
                      {onAnalyzeRisk && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={onAnalyzeRisk}
                        >
                          <ShieldAlert size={14} />
                          Run risk analysis
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Risk level</p>
                          <p className="font-semibold text-gray-900">
                            {
                              getRiskBadge({
                                status: riskAnalysis.status,
                                level: riskAnalysis.risk_level,
                              }).label
                            }
                          </p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-500">Score</p>
                          <p className="font-semibold text-gray-900">
                            {typeof riskAnalysis.risk_score === "number"
                              ? `${riskAnalysis.risk_score}/100`
                              : "Not scored"}
                          </p>
                        </div>
                      </div>

                      {riskAnalysis.summary && (
                        <p className="break-words text-sm text-gray-700 whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {riskAnalysis.summary}
                        </p>
                      )}

                      {riskAnalysis.status === "processing" ||
                      riskAnalysis.status === "pending" ? (
                        <p className="text-sm text-blue-700">
                          Analysis in progress. This can take up to a minute.
                        </p>
                      ) : riskAnalysis.status === "failed" ? (
                        <p className="text-sm text-red-700">
                          {riskAnalysis.error ||
                            "The analysis failed. The document was not marked as analysed."}
                        </p>
                      ) : riskAnalysis.status === "insufficient_evidence" ? (
                        <p className="text-sm text-gray-600">
                          Unable to determine a risk level from the available
                          text.
                        </p>
                      ) : riskAnalysis.findings?.length ? (
                        <div className="space-y-3">
                          <h4 className="text-sm font-semibold text-gray-900">
                            Risk indicators
                          </h4>
                          {riskAnalysis.findings.map((finding, index) => (
                            <div
                              key={index}
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
                              <blockquote className="mt-2 break-words rounded bg-gray-50 p-2 text-xs italic text-gray-700 [overflow-wrap:anywhere]">
                                “{finding.evidence}”
                              </blockquote>
                              <p className="mt-2 break-words text-xs text-gray-700 [overflow-wrap:anywhere]">
                                <span className="font-medium">
                                  AI interpretation:
                                </span>{" "}
                                {finding.explanation}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">
                          No specific grounded risk indicators were found.
                        </p>
                      )}

                      {riskAnalysis.findings?.some(
                        (finding) => finding.recommendation
                      ) && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-1">
                            Recommendations
                          </h4>
                          <ul className="space-y-1">
                            {riskAnalysis.findings
                              .filter((finding) => finding.recommendation)
                              .map((finding, index) => (
                                <li
                                  key={index}
                                  className="text-xs text-gray-700"
                                >
                                  • {finding.recommendation}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}

                      {onAnalyzeRisk && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={onAnalyzeRisk}
                        >
                          <RefreshCw size={14} />
                          Re-run analysis
                        </Button>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-3">
                    {RISK_DISCLAIMER_TEXT}
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* DOCUMENT CONTEXT HEADER BANNER */}
            {!documentId ? (
              <div className="flex shrink-0 items-start gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <FileText size={14} className="text-amber-600 flex-shrink-0" />
                <span className="min-w-0 break-words">No document selected. Please select a document from the list to ask questions about it.</span>
              </div>
            ) : (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileText size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="font-medium text-gray-700">Document:</span>
                  <span className="min-w-0 truncate font-semibold text-blue-900">
                    {selectedDocument?.title || documentId}
                  </span>
                </div>
                <Badge variant="success" size="sm" className="scale-75 origin-right">
                  Active
                </Badge>
              </div>
            )}

            {/* CHAT */}
            <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
              {messages.map((m) => {
                const isUser = isUserMessage(m);
                return (
                  <div
                    key={m.id}
                    className={`flex min-w-0 items-start gap-2 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isUser && (
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mt-0.5">
                        <Bot size={15} />
                      </div>
                    )}
                    <div
                      className={`min-w-0 max-w-[85%] break-words whitespace-pre-wrap rounded-lg p-3 text-sm shadow-xs [overflow-wrap:anywhere] ${
                        isUser
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-800 border border-gray-200"
                      }`}
                    >
                      {m.content}
                    </div>
                    {isUser && (
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-blue-500 text-white flex items-center justify-center mt-0.5">
                        <User size={14} />
                      </div>
                    )}
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex justify-start items-center gap-2">
                  <div className="flex-shrink-0 h-7 w-7 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                    <Bot size={15} />
                  </div>
                  <div className="bg-gray-100 text-gray-600 text-xs px-3 py-2 rounded-lg border border-gray-200 animate-pulse flex items-center gap-1.5">
                    DocuLens AI is thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* SUGGESTIONS */}
            {messages.length <= 1 && (
              <div className="p-2.5 border-t bg-gray-50">
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPrompts.slice(0, 4).map((p, i) => (
                    <Button
                      key={i}
                      size="sm"
                      variant="outline"
                      onClick={() => handleSuggestedPrompt(p)}
                      className="text-xs py-1"
                    >
                      <Sparkles size={12} className="mr-1" />
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* INPUT */}
            <div className="shrink-0 border-t bg-white p-3">
              <div className="flex min-w-0 gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      documentId
                        ? "Ask about this document..."
                        : "Please select a document from the list first..."
                    }
                    disabled={isTyping}
                  />
                </div>
                <Button className="min-h-11 min-w-11 shrink-0" aria-label="Send message" onClick={handleSendMessage} disabled={isTyping || !inputMessage.trim()}>
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ChatBot;

ChatBot.propTypes = {
  documentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedDocument: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
  }),
  summary: PropTypes.string,
  summaryLoading: PropTypes.bool,
  riskAnalysis: PropTypes.object,
  analysisLoading: PropTypes.bool,
  analysisError: PropTypes.string,
  onAnalyzeRisk: PropTypes.func,
  className: PropTypes.string,
};

