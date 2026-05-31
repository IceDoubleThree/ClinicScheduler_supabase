# Security Advisory: RLS Policy Vulnerability (2026-05-31)

## Vulnerability Summary

**Severity:** MEDIUM-HIGH (Information Disclosure)  
**Type:** Row-Level Security (RLS) Misconfiguration  
**Status:** REQUIRES IMMEDIATE REMEDIATION  

### Issue Description

The `public.users` table has an overly permissive RLS policy that exposes sensitive user data to all authenticated users:

```sql
CREATE POLICY "Allow username lookup for login" 
ON public.users 
FOR SELECT 
USING (true);
```

The `USING (true)` condition means any authenticated user can read all rows from the users table.

### Technical Impact

In Supabase, multiple SELECT policies are combined with **OR** logic:

```
auth.uid() = id  OR  true  =  true
```

This results in complete policy bypass. Any authenticated user can:

✗ Read all user IDs  
✗ Read all email addresses  
✗ Read all phone numbers  
✗ Read all usernames  
✗ Identify admin/doctor/user accounts (privilege enumeration)  

### Example Attack

```bash
curl -H "Authorization: Bearer <valid-token>" \
  "https://api.supabase.co/rest/v1/users?select=*"
```

Returns all 14 user records with sensitive PII.

---

## Remediation

### Step 1: Execute the Fix

Run the SQL migration in Supabase SQL Editor:

```sql
DROP POLICY IF EXISTS "Allow username lookup for login" ON public.users;
```

**File:** [`sql/001_fix_rls_vulnerability.sql`](sql/001_fix_rls_vulnerability.sql)

### Step 2: Verify the Fix

After applying the migration, test that:

1. **Current user can read their own profile:**
   ```sql
   SELECT * FROM users WHERE id = auth.uid();
   ```
   Should return 1 row (current user)

2. **Current user cannot read other profiles:**
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "https://api.supabase.co/rest/v1/users?id=eq.<other-user-id>"
   ```
   Should return empty result or 403 Forbidden

3. **Unauthenticated users have no access:**
   ```bash
   curl "https://api.supabase.co/rest/v1/users?select=*"
   ```
   Should return 401 Unauthorized

### Step 3: Session Rotation

If JWT tokens were shared or exposed during testing:
1. Log out all active sessions
2. Log back in to obtain new tokens
3. Delete any captured tokens from version control

---

## Current Policies (After Fix)

The remaining RLS policies should protect the `users` table:

```sql
-- Users can read their own profile
CREATE POLICY "Users can read own profile" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id);
```

---

## Why the "Username Lookup" Policy Was Problematic

**Original Intent:** Allow the app to check if a username is available during registration.

**Why NOT to use `USING (true)`:**
- Supabase Auth already handles sign-in: `supabase.auth.signInWithPassword()`
- The frontend should NEVER expose a "does email exist?" endpoint
- This is information disclosure by design

**Correct Approach:**
- Use a backend service (not REST API) for username availability checks
- Or use Supabase Functions to validate username before allowing signup
- Backend can perform checks on behalf of the client

---

## Additional Security Recommendations

### 1. Audit Other Tables for Similar Issues

Check all RLS policies for `USING (true)` patterns:

```sql
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  qual 
FROM pg_policies 
WHERE qual LIKE '%true%'
  AND schemaname = 'public';
```

### 2. Test Authorization in API Routes

Verify that backend API endpoints (`/api/users.ts`, `/api/health.ts`) have proper authorization:

```typescript
// ✓ Good: Check auth before querying users table
const user = await supabase.auth.getUser();
if (!user) return new Response("Unauthorized", { status: 401 });

// ✗ Bad: Allowing unauthenticated access to user data
const allUsers = await supabase.from('users').select('*');
```

### 3. Rotate Credentials

Any exposed authentication tokens should be considered compromised:
- Invalidate old sessions
- Regenerate API keys
- Review Supabase access logs

### 4. Add Monitoring

Set up alerts for:
- Large bulk SELECT queries on `users` table
- Queries from unexpected IPs
- Multiple failed authorization attempts

---

## References

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [Policy Combination Logic](https://supabase.com/docs/guides/auth/row-level-security#combining-multiple-policies)

---

## Checklist

- [ ] Apply SQL migration to drop vulnerable policy
- [ ] Verify policy is removed
- [ ] Test authorized access (current user)
- [ ] Test unauthorized access (other users)
- [ ] Rotate exposed JWT tokens
- [ ] Audit other tables for similar issues
- [ ] Review API authorization logic
- [ ] Document in team security notes

---

**Document Updated:** 2026-05-31  
**Last Audited:** 2026-05-31
