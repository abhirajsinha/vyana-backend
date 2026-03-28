import { Router as CRouter } from "express";
import {
  getCalendar,
  getCalendarDayInsight,
} from "../controllers/calendarController";
import { requireAuth as cAuth } from "../middleware/auth";

const calendarRouter = CRouter();
calendarRouter.get("/", cAuth, getCalendar);
calendarRouter.get("/day-insight", cAuth, getCalendarDayInsight);
export default calendarRouter;
