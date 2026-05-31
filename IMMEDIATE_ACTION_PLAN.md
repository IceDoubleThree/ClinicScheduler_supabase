# IMMEDIATE ACTION: Apply Security Fix to RLS Policy

**Status:** 🔴 CRITICAL - DO NOT SKIP  
**Time Estimate:** 5 minutes  
**Risk Level:** LOW (removing overly permissive policy)

---

## Step 1: Access Supabase Dashboard

1. Go to: https://app.supabase.com
2. Select your project: `ClinicScheduler` (or your project name)
3. Navigate to: **SQL Editor** (left sidebar)

---

## Step 2: View Current Policies

**Copy and paste this query:**

```sql
SELECT 
  schemaname,
  tablename, 
  policyname, 
  qual as condition,
  cmd as operation
FROM pg_policies 
WHERE tablename = 'users' 
ORDER BY policyname;
```

**Click ▶ Execute**

**You should see:**
- ✓ Allow username lookup for login (qual: true)
- ✓ Users can read own profile
- ✓ Users can insert their own profile  
- ✓ Users can update own profile

---

## Step 3: Apply the Fix

**Copy and paste this command:**

```sql
DROP POLICY "Allow username lookup for login" ON public.users;
```

**Click ▶ Execute**

**Expected output:**
```
DROP POLICY
Query returned successfully with no results
```

---

## Step 4: Verify the Fix

**Copy and paste this query:**

```sql
SELECT 
  schemaname,
  tablename, 
  policyname, 
  qual as condition,
  cmd as operation
FROM pg_policies 
WHERE tablename = 'users' 
ORDER BY policyname;
```

**Click ▶ Execute**

**You should now see:**
- ✓ Users can read own profile
- ✓ Users can insert their own profile  
- ✓ Users can update own profile
- ✗ Allow username lookup for login (REMOVED ✓)

---

## Step 5: Test Access Control

### Test 1: Verify Restriction Works

**Using Supabase Dashboard → SQL Editor:**

1. **Create a test token first:**
   - Go to **Authentication** → **Users**
   - Note down a test user's ID (e.g., `9254c54a-4d1f-411c-9585-dea0e796ec8e`)

2. **Test REST API access:**
   - Open a terminal
   - Replace `<TOKEN>` with a valid JWT from your app
   - Replace `<PROJECT_URL>` and `<ANON_KEY>` with your Supabase credentials

   ```bash
   # This should now FAIL (was working before)
   curl -H "Authorization: Bearer <TOKEN>" \
     "https://<PROJECT_URL>/rest/v1/users?select=*"
   ```

   **Expected result:**
   - Before fix: Returns all 14 users
   - After fix: Returns only current user's data (1 row) OR 403 Forbidden

3. **Test own profile access (should still work):**
   ```bash
   curl -H "Authorization: Bearer <TOKEN>" \
     "https://<PROJECT_URL>/rest/v1/users?id=eq.<CURRENT_USER_ID>"
   ```
   
   **Expected result:** 200 OK with user's own data

---

## Step 6: Session Management

### 🔐 Token Rotation (IMPORTANT)

If you shared any tokens during testing:

1. **In Supabase Dashboard:**
   - Go to **Authentication** → **Users**
   - Click each test user
   - Click **Delete session** or **Revoke tokens**

2. **In your app:**
   - Log out all users: Go to **Settings** or use logout button
   - Clear browser storage:
     ```javascript
     // In browser console
     localStorage.clear();
     sessionStorage.clear();
     ```

3. **Log back in:**
   - Use your app normally
   - New tokens will be generated

---

## Step 7: Update Code Documentation

Add this note to your project:

**File:** `shared/schema.ts` (or create comment in code)

```typescript
// ⚠️ SECURITY: RLS Policy on users table
// 
// VULNERABLE policy REMOVED on 2026-05-31:
//   - "Allow username lookup for login" (used USING (true))
//   
// ACTIVE restrictive policies:
//   - "Users can read own profile" (auth.uid() = id)
//   - "Users can insert their own profile" (auth.uid() = id)
//   - "Users can update own profile" (auth.uid() = id)
//
// These ensure:
//   ✓ Unauthenticated users: No access
//   ✓ Authenticated users: Only own profile
//
// Reference: SECURITY_ADVISORY.md
```

---

## Step 8: Commit & Document

**In your repository:**

```bash
# Stage the security files
git add sql/001_fix_rls_vulnerability.sql
git add SECURITY_ADVISORY.md
git add API_SECURITY_FIX.md
git add SECURITY_AUDIT_CHECKLIST.md

# Commit with clear message
git commit -m "Security: Fix RLS policy vulnerability exposing user data

- Remove overly permissive 'Allow username lookup for login' policy
- Policy used USING (true) which bypassed row-level security
- Any authenticated user could read all user records (14 users exposed)
- Exposed: emails, phone numbers, user IDs, usernames, user types
- Remaining policies enforce auth.uid() = id access control
- Fixes: Information disclosure vulnerability (Medium-High severity)

See SECURITY_ADVISORY.md for full details and testing procedures."

# Push to repository
git push origin main
```

---

## Step 9: Verification Checklist

Before you consider this DONE:

- [ ] SQL policy removed in Supabase
- [ ] Query returns only 1 user (current user)
- [ ] Query with invalid token returns 401
- [ ] Browser tokens cleared/rotated
- [ ] Documentation files created
- [ ] Changes committed to Git
- [ ] Team notified

---

## Troubleshooting

### ❌ "Policy not found" error
- The policy might have been already removed
- Check Step 4 again - does it still show 4 policies?
- If only 3 policies show: Fix already applied ✓

### ❌ Query still returns all users
- Refresh your browser
- Clear browser cache (Ctrl+Shift+Delete)
- Verify the policy was actually dropped (Step 4)
- Check that RLS is enabled on the table:
  ```sql
  SELECT rowsecurity FROM pg_tables 
  WHERE tablename = 'users';
  ```
  Should show: `true`

### ❌ Authorized users can't access their profile
- Verify they're using a valid token
- Check token hasn't expired
- Verify their user ID matches the token
- Test with a known good token from browser:
  ```javascript
  // In browser console
  const { data } = await supabase.auth.getSession();
  console.log(data.session?.access_token);
  ```

---

## Next Steps

After this fix is applied:

1. **HIGH PRIORITY:** Implement API authentication (`API_SECURITY_FIX.md`)
2. **MEDIUM:** Audit other tables for similar issues
3. **MEDIUM:** Add request logging for security monitoring
4. **LOW:** Update security training for team

---

**Document:** IMMEDIATE_ACTION_PLAN.md  
**Created:** 2026-05-31  
**Status:** Ready for execution
