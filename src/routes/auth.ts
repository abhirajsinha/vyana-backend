import { Router } from "express";
import { googleAuth, login, refresh, register } from "../controllers/authController";
import { authLoginRegisterLimiter, googleAuthLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/register", authLoginRegisterLimiter, register);
router.post("/login", authLoginRegisterLimiter, login);
router.post("/google", googleAuthLimiter, googleAuth);
router.post("/refresh", refresh);

export default router;
