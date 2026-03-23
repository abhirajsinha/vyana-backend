import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function saveLog(req: Request, res: Response): Promise<void> {
  const {
    mood,
    energy,
    sleep,
    stress,
    diet,
    exercise,
    activity,
    symptoms = [],
    focus,
    motivation,
    pain,
    social,
    cravings,
    fatigue,
  } = req.body;

  const log = await prisma.dailyLog.create({
    data: {
      userId: req.userId!,
      mood,
      energy,
      sleep,
      stress,
      diet,
      exercise,
      activity,
      symptoms,
      focus,
      motivation,
      pain,
      social,
      cravings,
      fatigue,
    },
  });

  res.status(201).json({ success: true, log });
}

export async function getLogs(req: Request, res: Response): Promise<void> {
  const { date } = req.query;
  const whereClause: {
    userId: string;
    date?: { gte: Date; lt: Date };
  } = { userId: req.userId! };

  if (typeof date === "string") {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    whereClause.date = { gte: start, lt: end };
  }

  const logs = await prisma.dailyLog.findMany({
    where: whereClause,
    orderBy: { date: "desc" },
    take: 30,
  });

  res.json(logs);
}
