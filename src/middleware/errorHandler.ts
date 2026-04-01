import { NextFunction, Request, Response } from "express";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const stack = err instanceof Error ? err.stack : undefined;
    res.status(500).json({ error: message, stack });
  } else {
    res.status(500).json({ error: "Internal server error" });
  }
}
