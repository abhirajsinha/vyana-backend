import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
p.healthPatternCache.deleteMany({}).then((r) => {
  console.log("Cleared", r.count, "cache entries");
  return p.$disconnect();
}).catch(console.error);
