import { Router } from "express";
import { getInsights, getInsightsForecast } from "../controllers/insightController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getInsights);
router.get("/forecast", requireAuth, getInsightsForecast);

export default router;
