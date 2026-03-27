import { Router } from "express";
import {
  getCurrentCycle,
  getCycleCalendar,
  periodStarted,
} from "../controllers/cycleController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/current", requireAuth, getCurrentCycle);
router.get("/calendar", requireAuth, getCycleCalendar);
router.post("/period-started", requireAuth, periodStarted);

export default router;
