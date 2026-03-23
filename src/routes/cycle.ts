import { Router } from "express";
import { getCurrentCycle } from "../controllers/cycleController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/current", requireAuth, getCurrentCycle);

export default router;
