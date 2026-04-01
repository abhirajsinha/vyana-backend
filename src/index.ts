import "dotenv/config";
import "./types/express";
import cors from "cors";
import express from "express";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import cycleRoutes from "./routes/cycle";
import logRoutes from "./routes/logs";
import insightsRoutes from "./routes/insights";
import chatRoutes from "./routes/chat";
import healthRoutes from "./routes/health";
import homeRoutes from "./routes/home";
import calendarRoutes from "./routes/calendar";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { generalApiLimiter } from "./middleware/rateLimit";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());
app.use("/api", generalApiLimiter);

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
app.use("/api/home", homeRoutes);
app.use("/api/calendar", calendarRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(port, () => {
  console.log(`Vyana backend running on port ${port}`);
});
