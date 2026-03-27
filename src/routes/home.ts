import { Router } from "express";
import { getHomeScreen } from "../controllers/homecontroller";
import { requireAuth } from "../middleware/auth";
 
const router = Router();
router.get("/", requireAuth, getHomeScreen);
export default router