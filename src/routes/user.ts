// src/routes/user.ts
// CHANGE SUMMARY: Added PUT /profile route.

import { Router } from "express";
import { getMe, updateProfile } from "../controllers/userController";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/me", requireAuth, getMe);
router.put("/profile", requireAuth, updateProfile);

export default router;