import { Router } from "express";
import { getLogs, saveLog } from "../controllers/logController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, saveLog);
router.get("/", requireAuth, getLogs);

export default router;
