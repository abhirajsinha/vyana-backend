import { Router } from "express";
import { getInsights } from "../controllers/insightController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getInsights);

export default router;
