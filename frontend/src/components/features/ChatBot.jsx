import { useState, useRef, useEffect } from "react";
import {
  Send,
  Bot,
  User,
  FileText,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import Card from "../ui/Card";
import PropTypes from "prop-types";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Badge from "../ui/Badge";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";

const isUserMessage = (m) => m?.role === "user" || m?.type === "user";

const ChatBot = ({
  documentId = null,
  selectedDocument = null,
  summary = null,
  summaryLoading = false,
  className = "",
}) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState("chatbot");

  // 🔹 STRUCTURED DATA STATE
  const [structuredData, setStructuredData] = useState(null);

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
     BUILD STRUCTURED DATA FROM SUMMARY
  ================================ */
  useEffect(() => {
    if (!documentId) return;

    if (summary && !summaryLoading) {
      setStructuredData({
        documentType: "Uploaded Document",

        keyMetrics: {
          "Summary Length": `${summary.length} characters`,
          Status: "Generated",
        },

        flaggedItems: [],

        recommendations: [
          "Review extracted summary",
          "Ask questions in chatbot",
          "Verify important clauses",
        ],

        summaryText: summary, // 👈 MAIN THING
      });
    }
  }, [summary, summaryLoading, documentId]);

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
    <Card className={`h-full flex flex-col ${className}`} padding="none">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("structured")}
          className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === "structured"
            ? "border-primary-500 text-primary-600"
            : "border-transparent text-gray-500"
            }`}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} />
            Structured Data Output
          </div>
        </button>

        <button
          onClick={() => setActiveTab("chatbot")}
          className={`px-4 py-3 text-sm font-medium border-b-2 ${activeTab === "chatbot"
            ? "border-primary-500 text-primary-600"
            : "border-transparent text-gray-500"
            }`}
        >
          <div className="flex items-center gap-2">
            <MessageSquare size={16} />
            Chatbot
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
          <div className="p-4 h-full overflow-y-auto space-y-6">
            {structuredData ? (
              <>
                {/* SUMMARY */}
                <div>
                  <h3 className="font-semibold mb-2">Document Summary</h3>
                  {summaryLoading ? (
                    <p className="text-gray-500">Generating summary...</p>
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {structuredData.summaryText}
                    </p>
                  )}
                </div>

                {/* METRICS */}
                <div>
                  <h3 className="font-semibold mb-2">Key Metrics</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(structuredData.keyMetrics).map(
                      ([key, value]) => (
                        <div
                          key={key}
                          className="p-3 bg-gray-50 rounded-lg"
                        >
                          <p className="text-xs text-gray-500">{key}</p>
                          <p className="font-semibold">{value}</p>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* RECOMMENDATIONS */}
                <div>
                  <h3 className="font-semibold mb-2">Recommendations</h3>
                  <ul className="space-y-1">
                    {structuredData.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        • {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-gray-500 text-center">
                No structured data available
              </p>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* DOCUMENT CONTEXT HEADER BANNER */}
            {!documentId ? (
              <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-1.5 flex-shrink-0">
                <FileText size={14} className="text-amber-600 flex-shrink-0" />
                <span>No document selected. Please select a document from the list to ask questions about it.</span>
              </div>
            ) : (
              <div className="bg-blue-50 border-b border-blue-200 px-3 py-1.5 text-xs text-blue-800 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText size={14} className="text-blue-600 flex-shrink-0" />
                  <span className="font-medium text-gray-700">Document:</span>
                  <span className="truncate font-semibold text-blue-900">
                    {selectedDocument?.title || documentId}
                  </span>
                </div>
                <Badge variant="success" size="sm" className="scale-75 origin-right">
                  Active
                </Badge>
              </div>
            )}

            {/* CHAT */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.map((m) => {
                const isUser = isUserMessage(m);
                return (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isUser && (
                      <div className="flex-shrink-0 h-7 w-7 rounded-full bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center mt-0.5">
                        <Bot size={15} />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] p-3 rounded-lg text-sm whitespace-pre-wrap shadow-xs ${
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
            <div className="p-3 border-t bg-white">
              <div className="flex gap-2">
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
                <Button onClick={handleSendMessage} disabled={isTyping || !inputMessage.trim()}>
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
  className: PropTypes.string,
};
