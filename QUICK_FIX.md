# 🚨 CRITICAL: DO THIS NOW (5 Minutes)

**Severity:** CRITICAL  
**Time:** ~5 minutes  
**Risk:** LOW (removing overly permissive policy)

---

## Copy This SQL Command

```sql
DROP POLICY "Allow username lookup for login" ON public.users;
```

---

## Where to Paste It

1. Go to: https://app.supabase.com
2. Select your ClinicScheduler project
3. Click: **SQL Editor** (left sidebar)
4. **Paste the command above** into the editor
5. **Click the ▶ button** to execute

---

## Expected Result

```
Query returned successfully with no results
```

or

```
DROP POLICY
```

---

## Verify It Worked

Paste this into SQL Editor:

```sql
SELECT polname FROM pg_policies 
WHERE polrelid = 'public.users'::regclass;
```

**Should show 3 policies:**
- Users can read own profile ✓
- Users can insert their own profile ✓
- Users can update own profile ✓

**Should NOT show:**
- ❌ Allow username lookup for login

---

## Done! ✓

That's it. The vulnerability is fixed.

**Next:** Read `IMMEDIATE_ACTION_PLAN.md` for testing and token rotation

---

**File:** `QUICK_FIX.md`  
**Created:** 2026-05-31  
**Status:** Ready
