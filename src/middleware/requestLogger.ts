import { Request, Response, NextFunction } from "express";

/**
 * Structured request logger — captures method, path, status, duration, and userId.
 * Outputs one JSON line per request for ingestion by logging services.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = {
      type: "request",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      userId: req.userId ?? null,
      timestamp: new Date().toISOString(),
    };

    // Warn on slow requests (>3s), skip health checks
    if (req.originalUrl === "/health") return;

    if (duration > 3000) {
      console.warn(JSON.stringify(log));
    } else {
      console.log(JSON.stringify(log));
    }
  });

  next();
}
