import { Router } from "express";
import { chat, getChatHistory } from "../controllers/chatController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/", requireAuth, chat);
router.get("/history", requireAuth, getChatHistory);

export default router;
