import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "../utils/password";
import { toPublicUser } from "../utils/userPublic";
import { verifyGoogleIdToken } from "../services/googleAuthService";
import { getCycleMode } from "../services/cycleEngine";
import { isCycleLengthDays } from "../types/cycleUser";

async function issueTokens(userId: string) {
  const accessToken = signAccessToken(userId);
  const { token: refreshToken, expiresAt } = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: { token: refreshToken, userId, expiresAt },
  });
  return { accessToken, refreshToken };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function register(req: Request, res: Response): Promise<void> {
  const {
    email,
    password,
    name,
    age,
    height,
    weight,
    cycleLength = 28,
    lastPeriodStart,
    contraceptiveMethod,
    cycleRegularity,
  } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "password is required" });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }
  if (!name || !age || !height || !weight || !lastPeriodStart) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Invalid email" });
    return;
  }
  if (!isCycleLengthDays(cycleLength)) {
    res.status(400).json({ error: "Cycle length must be between 21 and 35 days" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const cycleMode = getCycleMode({
    contraceptiveMethod:
      typeof contraceptiveMethod === "string" ? contraceptiveMethod : null,
    cycleRegularity:
      typeof cycleRegularity === "string" ? cycleRegularity : null,
  });

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      name,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      cycleLength: Number(cycleLength),
      lastPeriodStart: new Date(lastPeriodStart),
      contraceptiveMethod:
        typeof contraceptiveMethod === "string" ? contraceptiveMethod : null,
      cycleRegularity:
        typeof cycleRegularity === "string" ? cycleRegularity : null,
      cycleMode,
    },
  });

  const tokens = await issueTokens(user.id);
  res.status(201).json({ user: toPublicUser(user), tokens });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "email is required" });
    return;
  }
  if (!password || typeof password !== "string") {
    res.status(400).json({ error: "password is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const tokens = await issueTokens(user.id);
  res.json({ user: toPublicUser(user), tokens });
}

export async function googleAuth(req: Request, res: Response): Promise<void> {
  const {
    idToken,
    name,
    age,
    height,
    weight,
    cycleLength = 28,
    lastPeriodStart,
    contraceptiveMethod,
    cycleRegularity,
  } = req.body;

  if (!idToken || typeof idToken !== "string") {
    res.status(400).json({ error: "idToken is required" });
    return;
  }
  if (!age || !height || !weight || !lastPeriodStart) {
    res.status(400).json({ error: "Missing required profile fields" });
    return;
  }
  if (!isCycleLengthDays(cycleLength)) {
    res.status(400).json({ error: "Cycle length must be between 21 and 35 days" });
    return;
  }

  let googleUser: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    googleUser = await verifyGoogleIdToken(idToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google token verification failed";
    if (msg.includes("GOOGLE_CLIENT_ID")) {
      res.status(503).json({ error: "Google sign-in is not configured on the server" });
      return;
    }
    res.status(401).json({ error: "Invalid Google token" });
    return;
  }

  if (!googleUser.emailVerified) {
    res.status(400).json({ error: "Google email must be verified" });
    return;
  }

  const normalizedEmail = googleUser.email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: "Invalid email from Google token" });
    return;
  }

  const displayName = (typeof name === "string" && name.trim()) || googleUser.name || "User";
  const cycleMode = getCycleMode({
    contraceptiveMethod:
      typeof contraceptiveMethod === "string" ? contraceptiveMethod : null,
    cycleRegularity:
      typeof cycleRegularity === "string" ? cycleRegularity : null,
  });

  const byGoogle = await prisma.user.findUnique({ where: { googleId: googleUser.googleId } });
  if (byGoogle) {
    const tokens = await issueTokens(byGoogle.id);
    res.json({ user: toPublicUser(byGoogle), tokens });
    return;
  }

  const byEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (byEmail) {
    if (byEmail.passwordHash && !byEmail.googleId) {
      res.status(409).json({
        error: "An account with this email already exists. Sign in with email and password.",
      });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: googleUser.googleId },
    });
    const tokens = await issueTokens(updated.id);
    res.json({ user: toPublicUser(updated), tokens });
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      googleId: googleUser.googleId,
      name: displayName,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      cycleLength: Number(cycleLength),
      lastPeriodStart: new Date(lastPeriodStart),
      contraceptiveMethod:
        typeof contraceptiveMethod === "string" ? contraceptiveMethod : null,
      cycleRegularity:
        typeof cycleRegularity === "string" ? cycleRegularity : null,
      cycleMode,
    },
  });

  const tokens = await issueTokens(user.id);
  res.status(201).json({ user: toPublicUser(user), tokens });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken is required" });
    return;
  }

  let payload: { userId: string; type?: string };
  try {
    payload = verifyToken(refreshToken);
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
    return;
  }

  if (payload.type !== "refresh") {
    res.status(401).json({ error: "Invalid refresh token type" });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.status(401).json({ error: "Refresh token expired or revoked" });
    return;
  }

  const accessToken = signAccessToken(payload.userId);
  res.json({ accessToken });
}
