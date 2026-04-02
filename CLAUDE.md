# 🚀 VYANA BACKEND — PRODUCTION SECURITY + DEPLOY TASK

You are working on a Node.js + Prisma backend using Supabase (as Postgres) and deploying to Railway.

Your job is to:

1. Fix ALL Supabase security issues (RLS, policies)
2. Ensure backend-only DB access (no public exposure)
3. Prepare project for Railway deployment
4. Deploy successfully

---

# 🧠 CONTEXT

* Supabase is used ONLY as a PostgreSQL database
* Prisma is the ONLY DB client
* Frontend DOES NOT directly call Supabase
* Backend runs on Railway

---

# 🚨 CRITICAL SECURITY FIXES (DO FIRST)

## 1. Enable RLS on ALL tables

Run this SQL in Supabase SQL Editor:

```sql
DO $$ 
DECLARE 
  t record;
BEGIN
  FOR t IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t.tablename);
  END LOOP;
END $$;
```

---

## 2. Add backend-only access policy

Run:

```sql
DO $$ 
DECLARE 
  t record;
BEGIN
  FOR t IN 
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('
      CREATE POLICY "Allow backend full access" 
      ON public.%I 
      FOR ALL 
      USING (true) 
      WITH CHECK (true);
    ', t.tablename);
  END LOOP;
END $$;
```

---

## 3. IMPORTANT SECURITY RULES

* DO NOT use Supabase client in frontend
* DO NOT expose publishable key
* DO NOT expose secret key
* ONLY use DATABASE_URL in backend

---

# 🧱 BACKEND SETUP FIXES

## 4. Ensure Prisma is production-ready

Update `package.json` scripts:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "postinstall": "prisma generate",
  "migrate": "prisma migrate deploy"
}
```

---

## 5. Ensure server uses dynamic port

In your server entry:

```ts
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## 6. Add health check endpoint

```ts
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});
```

---

# 🚀 RAILWAY DEPLOYMENT SETUP

## 7. Railway configuration

Set:

Build command:

```
npm install && npm run build
```

Start command:

```
npm run migrate && npm run start
```

---

## 8. Environment variables (Railway)

Add:

```
DATABASE_URL=your_supabase_connection_string
JWT_SECRET=your_secret
NODE_ENV=production
```

---

## 9. Ensure Prisma works with Supabase

* Use `prisma migrate deploy`
* DO NOT use `prisma db push` in production

---

# 🔐 POST-DEPLOY SECURITY

## 10. Rotate Supabase keys

In Supabase dashboard:

* Regenerate publishable key
* Regenerate secret key

---

## 11. Verify DB is NOT public

* Direct API access should fail
* Only backend should access DB

---

# 🧪 FINAL VERIFICATION

Ensure:

* /api/health returns { status: "ok" }
* DB queries work
* No errors in Railway logs
* No public Supabase access

---

# 🎯 GOAL

End state must be:

* Database is private (RLS enabled)
* Backend is the only access layer
* App is deployed and live on Railway
* No exposed credentials
* No failing migrations

---

If anything fails:

* check Railway logs
* check DATABASE_URL
* check Prisma migration status

---

DO NOT SKIP ANY STEP.
Execute in order.
