import { Router } from "express";
import { sendNotifications } from "../controllers/notificationController";

const router = Router();

router.post("/send-notifications", sendNotifications);

export default router;
