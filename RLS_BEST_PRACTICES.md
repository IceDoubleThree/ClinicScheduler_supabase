# RLS Quick Reference & Security Best Practices

**For:** ClinicScheduler Development Team  
**Purpose:** Prevent similar vulnerabilities in the future  
**Last Updated:** 2026-05-31

---

## ❌ NEVER DO THIS

### ❌ Never use `USING (true)`

```sql
-- 🚫 FORBIDDEN - Allows all authenticated users to read all rows
CREATE POLICY "Allow username lookup" ON public.users 
FOR SELECT 
USING (true);

-- This bypasses auth checks entirely when combined with other policies
```

**Why:** In Supabase, multiple SELECT policies combine with **OR** logic:
```
auth.uid() = id  OR  true  =  true
```

### ❌ Never allow unauthenticated access to PII tables

```sql
-- 🚫 FORBIDDEN
CREATE POLICY "Public access" ON public.users 
FOR SELECT 
USING (auth.role() = 'anon');

-- This exposes user emails/phone to unauthenticated users
```

### ❌ Never allow blind bulk reads

```sql
-- 🚫 FORBIDDEN - Allows SELECT * on entire table
CREATE POLICY "Read all" ON public.appointments 
FOR SELECT 
USING (true);

-- This lets any user see every appointment (privacy violation)
```

---

## ✅ ALWAYS DO THIS

### ✅ Use owner-based checks

```sql
-- ✓ GOOD - Users can only read their own record
CREATE POLICY "Users read own profile" ON public.users 
FOR SELECT 
USING (auth.uid() = id);
```

### ✅ Use role-based checks

```sql
-- ✓ GOOD - Only admins can read all users
CREATE POLICY "Admin read all users" ON public.users 
FOR SELECT 
USING (auth.uid() IN (
  SELECT id FROM users WHERE user_type = 'admin'
));
```

### ✅ Use relationship checks

```sql
-- ✓ GOOD - Patients can see their own appointments
CREATE POLICY "Patients see own appointments" ON public.appointments 
FOR SELECT 
USING (
  patient_id = (SELECT patient_id FROM patients WHERE user_id = auth.uid())
);

-- ✓ GOOD - Doctors can see appointments assigned to them
CREATE POLICY "Doctors see their appointments" ON public.appointments 
FOR SELECT 
USING (
  doctor_id = (SELECT id FROM users WHERE id = auth.uid())
);
```

### ✅ Use time-based checks

```sql
-- ✓ GOOD - Users can only edit recent records
CREATE POLICY "Edit recent records" ON public.records 
FOR UPDATE 
USING (
  user_id = auth.uid() AND 
  created_at > NOW() - INTERVAL '24 hours'
);
```

---

## Table-by-Table Security Checklist

### users
- [ ] ✓ RLS enabled
- [ ] ✓ SELECT: `auth.uid() = id` (users read own)
- [ ] ✓ INSERT: `auth.uid() = id` (self-registration only)
- [ ] ✓ UPDATE: `auth.uid() = id` (self-update only)
- [ ] ✓ DELETE: No policy (disabled)
- [ ] ✓ NO `USING (true)` policies

### patients
- [ ] ✓ RLS enabled
- [ ] ✓ SELECT: Check user can read this patient's records
- [ ] ✓ INSERT: Only patient's own user can insert
- [ ] ✓ UPDATE: User can update own records only
- [ ] ✓ DELETE: Restricted or disabled

### appointments
- [ ] ✓ RLS enabled
- [ ] ✓ SELECT: Patient sees own, doctor sees assigned
- [ ] ✓ INSERT: Only assigned doctor or patient can create
- [ ] ✓ UPDATE: Patient can reschedule own, doctor can manage
- [ ] ✓ DELETE: Restricted to admin

### records
- [ ] ✓ RLS enabled
- [ ] ✓ SELECT: Patient sees own, doctor sees patient's
- [ ] ✓ INSERT: Doctor can add, patient cannot
- [ ] ✓ UPDATE: Doctor can edit, patient cannot
- [ ] ✓ DELETE: Doctor can delete

---

## API Authorization Pattern

### ❌ Bad Pattern

```typescript
// No auth check - vulnerable
export default async function handler(req, res) {
  const data = await db.query('SELECT * FROM users');
  return res.json(data);
}
```

### ✅ Good Pattern

```typescript
export default async function handler(req, res) {
  // 1. Verify authentication
  const token = req.headers.authorization?.split('Bearer ')[1];
  const user = await supabase.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // 2. Apply authorization (if needed beyond RLS)
  const userId = user.id;

  // 3. Query through Supabase (RLS applied automatically)
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
```

---

## Deployment Workflow

### When Adding New Tables

1. **Define RLS policies BEFORE** creating the table
2. **Test policies** with test users in staging
3. **Never deploy** without explicit policies
4. **Document** why each policy exists

### When Modifying Policies

```sql
-- 1. Review old policy
SELECT pol.polname, pg_get_expr(pol.polqual, pol.polrelid)
FROM pg_policy pol 
WHERE pol.polrelid = 'public.users'::regclass;

-- 2. Create new policy with different name
CREATE POLICY "policy_v2_..." ON public.users ...;

-- 3. Test new policy
SELECT * FROM users; -- (as different users)

-- 4. Drop old policy only after verification
DROP POLICY "policy_v1_..." ON public.users;

-- 5. Verify result
SELECT pol.polname FROM pg_policy pol 
WHERE pol.polrelid = 'public.users'::regclass;
```

---

## Testing RLS Policies

### Test Setup

```bash
# Get your Supabase URL and ANON key
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_ANON_KEY="eyJ..."
```

### Test as Different User Types

```bash
# Test as patient (normal user)
TOKEN=$(supabase token user)
curl -H "Authorization: Bearer $TOKEN" \
  "$SUPABASE_URL/rest/v1/users"

# Test as doctor
TOKEN=$(supabase token doctor)
curl -H "Authorization: Bearer $TOKEN" \
  "$SUPABASE_URL/rest/v1/users"

# Test as admin
TOKEN=$(supabase token admin)
curl -H "Authorization: Bearer $TOKEN" \
  "$SUPABASE_URL/rest/v1/users"

# Test unauthenticated (should fail)
curl "$SUPABASE_URL/rest/v1/users"
```

### Automated Testing (Suggested)

```typescript
import { createClient } from '@supabase/supabase-js';

async function testRLS() {
  const adminClient = createClient(URL, ADMIN_KEY); // admin
  const userClient = createClient(URL, USER_KEY);   // regular user
  
  // Admin should see all appointments
  const { data: adminData } = await adminClient
    .from('appointments')
    .select('*');
  console.assert(adminData.length > 1, 'Admin should see all');
  
  // User should see only own
  const { data: userData } = await userClient
    .from('appointments')
    .select('*');
  console.assert(userData.length <= 1, 'User should see only own');
}
```

---

## Monitoring & Auditing

### Enable Audit Logs

In Supabase Dashboard → **Settings** → **API** → Enable **Audit Logs**

### Suspicious Activity Patterns

Alert on:
- ❌ `SELECT *` queries on `users` table
- ❌ Queries from unexpected IPs
- ❌ Large result sets (bulk read attempts)
- ❌ Multiple failed authorization attempts
- ❌ Non-owner UPDATE/DELETE requests

### Regular Reviews

- [ ] Monthly: Review policy logs
- [ ] Quarterly: Audit all RLS policies
- [ ] On deploy: Test policies before release
- [ ] After incident: Review what went wrong

---

## Resources

- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security](https://www.postgresql.org/docs/current/sql-createpolicy.html)
- [OWASP Authentication](https://owasp.org/www-community/attacks/Authentication_Cheat_Sheet)
- [ClinciScheduler SECURITY_ADVISORY.md](./SECURITY_ADVISORY.md)

---

## Questions?

Contact: Security Team  
Report Issues: Create a GitHub issue with `[SECURITY]` prefix  
Emergency: Escalate to project lead immediately
