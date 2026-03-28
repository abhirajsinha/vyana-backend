import { Router } from "express";
import { getHomeScreen } from "../controllers/homeController";
import { requireAuth } from "../middleware/auth";
 
const router = Router();
router.get("/", requireAuth, getHomeScreen);
export default router