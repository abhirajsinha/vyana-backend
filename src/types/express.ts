/** Side-effect: extend Express.Request (JWT middleware sets `userId`). Import before `Request` from "express". */
export {};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
