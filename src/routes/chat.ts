import { Router } from "express";
import { chat, getChatHistory } from "../controllers/chatController";
import { requireAuth } from "../middleware/auth";
import { chatLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/", chatLimiter, requireAuth, chat);
router.get("/history", chatLimiter, requireAuth, getChatHistory);

export default router;
