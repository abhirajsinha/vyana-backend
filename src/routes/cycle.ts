import { Router } from "express";
import {
  getCurrentCycle,
  periodStarted,
} from "../controllers/cycleController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/current", requireAuth, getCurrentCycle);
router.post("/period-started", requireAuth, periodStarted);

export default router;
