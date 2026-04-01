import { Router } from "express";
import {
  getLogs,
  saveLog,
  editLog,
  quickCheckIn,
  getQuickLogConfig,
} from "../controllers/logController";
import { requireAuth } from "../middleware/auth";
import { logLimiter } from "../middleware/rateLimit";
const router = Router();

router.post("/", requireAuth, logLimiter, saveLog);
router.get("/", requireAuth, getLogs);
router.put("/:id", requireAuth, logLimiter, editLog);
router.post("/quick-check-in", requireAuth, logLimiter, quickCheckIn);
router.get("/quick-log-config", requireAuth, getQuickLogConfig);

export default router;
