import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import cors from "cors";
import customerRoutes from "./routes/customerRoutes.js";
import zaloZnsRoutes from "./routes/zaloZnsRoutes.js"; // Import router mới
import authRoutes from "./routes/authRoutes.js";
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
app.use("/api/zns", zaloZnsRoutes); // Sử dụng router mới tạo
app.use("/api/auth", authRoutes);

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
