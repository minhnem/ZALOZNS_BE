import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import cors from "cors";
import customerRoutes from "./routes/customerRoutes.js";
import zaloZnsRoutes from "./routes/zaloZnsRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import campaignRoutes from "./routes/campaignRoutes.js";
import znsTemplateRoutes from "./routes/znsTemplateRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import activityLogRoutes from "./routes/activityLogRoutes.js";
import { scheduleZaloZNS } from "./services/zaloZnsService.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
const dbURL = process.env.MONGODB_URI;
const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/api/customers", customerRoutes);
app.use("/api/zns", zaloZnsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/zns-templates", znsTemplateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/users", userRoutes);
app.use("/api/activity-logs", activityLogRoutes);

// Base route for health check
app.get("/", (req, res) => {
  res.send("AI Chatbot Server is running.");
});

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
    });
  })
  .catch((error) => {
    console.log(error);
  });
