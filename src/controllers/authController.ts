import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt";

export async function register(req: Request, res: Response): Promise<void> {
  const { name, age, height, weight, cycleLength = 28, lastPeriodStart } = req.body;

  if (!name || !age || !height || !weight || !lastPeriodStart) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const user = await prisma.user.create({
    data: {
      name,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      cycleLength: Number(cycleLength),
      lastPeriodStart: new Date(lastPeriodStart),
    },
  });

  const accessToken = signAccessToken(user.id);
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  res.status(201).json({ user, tokens: { accessToken, refreshToken } });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const accessToken = signAccessToken(user.id);
  const { token: refreshToken, expiresAt } = signRefreshToken(user.id);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  res.json({ user, tokens: { accessToken, refreshToken } });
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
