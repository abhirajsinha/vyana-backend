import { Router } from "express";
import { getCurrentCycle, getCycleCalendar } from "../controllers/cycleController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/current", requireAuth, getCurrentCycle);
router.get("/calendar", requireAuth, getCycleCalendar);

export default router;
