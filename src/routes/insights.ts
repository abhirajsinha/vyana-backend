import { Router } from "express";
import { getInsights, getInsightsContext, getInsightsForecast } from "../controllers/insightControllerPhase1";
import { requireAuth } from "../middleware/auth";
import { insightLimiter } from "../middleware/rateLimit";

const router = Router();

router.get("/", requireAuth, insightLimiter, getInsights);
router.get("/context", requireAuth, getInsightsContext);
router.get("/forecast", requireAuth, insightLimiter, getInsightsForecast);

export default router;
