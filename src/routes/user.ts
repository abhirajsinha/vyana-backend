// src/routes/user.ts
// CHANGE SUMMARY: Added PUT /profile route.

import { Router } from "express";
import { getMe, updateProfile } from "../controllers/userController";
import { updateFcmToken } from "../controllers/notificationController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/me", requireAuth, getMe);
router.put("/profile", requireAuth, updateProfile);
router.put("/fcm-token", requireAuth, updateFcmToken);

export default router;