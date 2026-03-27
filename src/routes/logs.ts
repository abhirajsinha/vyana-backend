import { Router } from "express";
import {
  getLogs,
  saveLog,
  getQuickLogConfig,
} from "../controllers/logController";
import { requireAuth } from "../middleware/auth";
const router = Router();

router.post("/", requireAuth, saveLog);
router.get("/", requireAuth, getLogs);
router.get("/quick-log-config", requireAuth, getQuickLogConfig);

export default router;
