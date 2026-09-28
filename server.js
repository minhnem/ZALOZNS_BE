import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import cors from "cors";

// Middleware
import { requireAuth } from "./middlewares/authMiddleware.js";
import { tenantMiddleware } from "./middlewares/tenantMiddleware.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import zaloZnsRoutes from "./routes/zaloZnsRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import znsTemplateRoutes from "./routes/znsTemplateRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";
import kiotvietRoutes from "./routes/kiotvietRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";

// Services
import { scheduleZaloZNS } from "./services/zaloZnsService.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
const dbURL = process.env.MONGODB_URI;
const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

import webhookRoutes from "./routes/webhookRoutes.js";

// ═══════════════════════════════════════════════════
// Routes KHÔNG cần Auth (Public)
// ═══════════════════════════════════════════════════

// Health check
app.get("/", (req, res) => {
  res.send("AI Chatbot Server is running. (Multi-tenant enabled)");
});

// Auth routes (login/register) - Không cần auth hay tenant context
app.use("/api/auth", authRoutes);

// Phase 5: Webhook routes - Không cần auth, tự xử lý tenant context
app.use("/api/webhook", webhookRoutes);

// ═══════════════════════════════════════════════════
// Routes CẦN Auth + Tenant Context
// ═══════════════════════════════════════════════════

// Middleware chain: requireAuth → tenantMiddleware → route handler
// 1. requireAuth: Verify JWT, tìm User, gắn tenant_id từ JWT vào req.user
// 2. tenantMiddleware: Đọc tenant_id từ req.user → Set AsyncLocalStorage context
// 3. Từ đây, mọi Mongoose query sẽ tự động filter theo tenant_id
app.use(requireAuth);
app.use(tenantMiddleware);

app.use("/api/customers", customerRoutes);
app.use("/api/zns", zaloZnsRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/zns-templates", znsTemplateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/kiotviet", kiotvietRoutes);
app.use("/api/reports", reportRoutes);

import superAdminRoutes from "./routes/superAdminRoutes.js";
import { requireSuperAdmin } from "./middlewares/authMiddleware.js";

// TODO (Phase 9): Super Admin routes
app.use("/api/super-admin", requireSuperAdmin, superAdminRoutes);

// ═══════════════════════════════════════════════════
// Database Connection & Server Start
// ═══════════════════════════════════════════════════

const connectDB = async () => {
  try {
    await mongoose.connect(dbURL);
    console.log("connect to db successfully");
  } catch (error) {
    console.log(`can not connect to db ${error}`);
  }
};

connectDB()
  .then(() => {
    scheduleZaloZNS();
    app.listen(PORT, () => {
      console.log(`server is starting at http://localhost:${PORT}`);
      console.log(`Multi-tenant mode: ENABLED`);
    });
  })
  .catch((error) => {
    console.log(error);
  });
