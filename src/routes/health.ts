import { Router } from "express";
import { getHealthPatterns } from "../controllers/healthController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/patterns", requireAuth, getHealthPatterns);

export default router;
