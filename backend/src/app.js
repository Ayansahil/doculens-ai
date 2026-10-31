import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import documentRoutes from "./routes/document.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import { limits, describeLimits } from "./config/limits.js";
import {
  apiIpRateLimit,
  publicIpRateLimit,
} from "./middleware/rate-limit.middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ Behind a reverse proxy / load balancer, set TRUST_PROXY so req.ip is real.
// Never enable this blindly: a spoofed X-Forwarded-For would bypass IP limits.
if (limits.trustProxy !== false) {
  app.set("trust proxy", limits.trustProxy);
}

// ✅ CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5174",
    ],
    credentials: true,
  }),
);

// ✅ IP protection for every API/public request. Per-user limits are applied
// on the authenticated routes themselves.
app.use(apiIpRateLimit);

// ✅ Body Parsers (bounded; AI chat sends small JSON payloads only)
app.use(express.json({ limit: limits.maxJsonBody }));
app.use(express.urlencoded({ extended: true, limit: limits.maxJsonBody }));

// ✅ STATIC FILES - Yeh line pehle aani chahiye routes se
// Agar tumhara uploads folder ROOT mein hai (backend ke bahar)
app.use(
  "/uploads",
  publicIpRateLimit,
  express.static(path.join(__dirname, "../uploads")),
);

// Agar uploads folder backend ke andar hai
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

console.log("📂 Uploads folder path:", path.join(__dirname, "../uploads"));
console.log("🛡️ Rate limiting:", describeLimits());

// ✅ Health Check
app.get("/", (req, res) => {
  res.json({
    message: "DocuLens AI Backend API",
    version: "1.0.0",
    status: "running",
    port: process.env.PORT || 3000,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/",
      documents: "/documents",
      analytics: "/analytics",
      chat: "/chat",
      chatHistory: "/chat/history",
      uploads: "/uploads",
    },
  });
});


// ✅ API Routes
app.use("/documents", documentRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/chat", chatRoutes);


// ✅ 404 Handler
app.use((req, res) => {
  console.log(`❌ 404 - ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
    method: req.method,
    availableRoutes: ["/documents", "/analytics", "/chat", "/chat/history"],
  });
});

// ✅ Error Handler (maps body/multipart limit failures to clear 4xx responses)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  let status = Number(err.status || err.statusCode) || 500;
  let code = err.code || null;
  let message = err.message || "Internal server error";

  if (err.name === "MulterError") {
    code = err.code;
    if (err.code === "LIMIT_FILE_SIZE") {
      status = 413;
      message = `File is too large. Maximum size is ${Math.round(
        limits.maxFileSizeBytes / (1024 * 1024),
      )} MB.`;
    } else {
      status = 400;
      message =
        err.code === "LIMIT_UNEXPECTED_FILE"
          ? "Unexpected file field. Upload exactly one file under the 'file' field."
          : "The upload could not be processed.";
    }
  } else if (err.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body must be valid JSON.";
  } else if (err.type === "encoding.unsupported") {
    status = 415;
    code = "UNSUPPORTED_ENCODING";
    message = "Unsupported request encoding.";
  }

  if (status >= 500) {
    console.error("💥 Error:", err);
  } else {
    console.warn(`⚠️ ${status} ${req.method} ${req.path}: ${message}`);
  }

  res.status(status).json({
    success: false,
    status,
    code,
    message,
    ...(status >= 500 && process.env.NODE_ENV === "development"
      ? { error: err.stack }
      : {}),
  });
});

export default app;
