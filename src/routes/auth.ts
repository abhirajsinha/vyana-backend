import { Router } from "express";
import { googleAuth, login, refresh, register } from "../controllers/authController";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/refresh", refresh);

export default router;
