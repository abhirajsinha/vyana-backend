import { Router } from "express";
import { getInsights, getInsightsContext, getInsightsForecast } from "../controllers/insightController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getInsights);
router.get("/context", requireAuth, getInsightsContext);
router.get("/forecast", requireAuth, getInsightsForecast);

export default router;
