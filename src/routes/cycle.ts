import { Router } from "express";
import {
  getCurrentCycle,
  periodStarted,
  undoPeriodStarted,
} from "../controllers/cycleController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/current", requireAuth, getCurrentCycle);
router.post("/period-started", requireAuth, periodStarted);
router.delete("/period-started/:id", requireAuth, undoPeriodStarted);

export default router;
