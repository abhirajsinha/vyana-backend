import "dotenv/config";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import cycleRoutes from "./routes/cycle";
import logRoutes from "./routes/logs";
import insightsRoutes from "./routes/insights";
import chatRoutes from "./routes/chat";
import healthRoutes from "./routes/health";
import { errorHandler, notFound } from "./middleware/errorHandler";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vyana-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/cycle", cycleRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/insights", insightsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/health", healthRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Vyana backend running on port ${port}`);
});
