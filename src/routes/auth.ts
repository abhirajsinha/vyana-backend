import { Router } from "express";
import { googleAuth, login, refresh, register } from "../controllers/authController";
import { authLoginRegisterLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/register", authLoginRegisterLimiter, register);
router.post("/login", authLoginRegisterLimiter, login);
router.post("/google", googleAuth);
router.post("/refresh", refresh);

export default router;
