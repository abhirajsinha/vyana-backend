import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
}
