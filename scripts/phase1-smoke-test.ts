import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return r.json();
}

async function get(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function main() {
  const email = `smoke-${Date.now()}@test.vyana`;
  console.log("\n PHASE 1 SMOKE TEST\n");

  // Register
  const reg = await post("/api/auth/register", {
    email, password: "testpass123", name: "Smoke Test",
    age: 28, height: 165, weight: 58, cycleLength: 28,
    lastPeriodStart: new Date(Date.now() - 10 * 86400000).toISOString(),
  }) as any;
  const token = reg.tokens?.accessToken;
  if (!token) { console.error("Registration failed:", reg); return; }
  console.log("Registered");

  // Zero-log insights
  const ins0 = await get("/api/insights", token) as any;
  console.log(`Zero-log: cycleDay=${ins0.cycleDay}, aiEnhanced=${ins0.aiEnhanced}`);
  console.log(`  vyana.physical: "${ins0.view?.vyana?.physical?.slice(0, 60)}..."`);

  // Quick check-in
  await post("/api/logs/quick-check-in", { mood: "low", energy: "low", stress: "high" }, token);
  console.log("Logged (1 entry)");

  // 1-log insights
  const ins1 = await get("/api/insights", token) as any;
  console.log(`1-log: confidence=${ins1.confidence}`);

  // Chat
  const chat = await post("/api/chat", { message: "How am I doing?" }, token) as any;
  console.log(`Chat: "${chat.reply?.slice(0, 60)}..."`);

  // Home
  const home = await get("/api/home", token) as any;
  console.log(`Home: title="${home.title}"`);

  // Forecast (warmup)
  const forecast = await get("/api/insights/forecast", token) as any;
  console.log(`Forecast: available=${forecast.available}`);

  console.log("\nSmoke test complete.\n");
}

main().catch(console.error);
