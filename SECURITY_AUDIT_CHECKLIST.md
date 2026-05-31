# Security Audit Checklist - ClinicScheduler

**Last Updated:** 2026-05-31  
**Status:** CRITICAL ISSUES IDENTIFIED  
**Severity:** MEDIUM-HIGH

---

## 🔴 IMMEDIATE ACTIONS REQUIRED

### 1. Database Security - RLS Policy
- [ ] **Execute SQL migration** to remove vulnerable policy
  - File: `sql/001_fix_rls_vulnerability.sql`
  - Action: `DROP POLICY "Allow username lookup for login" ON public.users;`
  - Timeline: **TODAY**
  
- [ ] **Verify fix in Supabase**
  ```sql
  SELECT polname FROM pg_policies 
  WHERE polrelid = 'public.users'::regclass 
  AND polname = 'Allow username lookup for login';
  ```
  - Expected result: Empty (0 rows)

- [ ] **Test access control**
  - Authenticated user can read own profile ✓
  - Authenticated user cannot read others ✓
  - Unauthenticated users rejected ✓

### 2. Session Security - Token Rotation
- [ ] **Identify exposed tokens**
  - Check: Any JWT tokens shared in Git history
  - Check: Any tokens posted in issues/docs
  - Check: `attached_assets/` folder for sensitive data
  
- [ ] **Rotate all active sessions**
  - Log out all users
  - Invalidate existing tokens
  - Users log back in

- [ ] **Purge leaked tokens**
  - Remove from Git history: `git filter-branch` or `git filter-repo`
  - Remove from documentation
  - Invalidate in Supabase dashboard

---

## 🟡 HIGH PRIORITY (This Sprint)

### 3. API Authorization - `/api/users.ts`
- [ ] **Add authentication check** to GET endpoints
  - File: `api/users.ts`
  - Implementation: `API_SECURITY_FIX.md` → Option 1 or 2
  - Require valid JWT token for all requests

- [ ] **Restrict username lookup**
  - Decision: Should username availability check be public?
  - If yes: Move to separate endpoint with rate limiting
  - If no: Remove entirely and rely on front-end validation

- [ ] **Restrict ID-based user lookup**
  - Only allow users to fetch their own profile
  - Add: `if (id !== currentUserId) return 403`

- [ ] **Test API security**
  ```bash
  # Should fail
  curl "http://localhost/api/users?id=<user-id>"
  
  # Should fail  
  curl -H "Auth: invalid-token" "http://localhost/api/users?id=<user-id>"
  
  # Should succeed
  curl -H "Auth: valid-token" "http://localhost/api/users?id=<same-user-id>"
  ```

### 4. Database - Audit Other Policies
- [ ] **Check for other `USING (true)` patterns**
  ```sql
  SELECT schemaname, tablename, policyname, qual 
  FROM pg_policies 
  WHERE qual LIKE '%true%' AND schemaname = 'public';
  ```

- [ ] **Review tables needing RLS**
  - patients
  - appointments
  - records
  - schedules
  - Any other PII tables

- [ ] **Verify RLS is enabled**
  ```sql
  SELECT schemaname, tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public';
  ```
  - Expected: rowsecurity = true

---

## 🟢 MEDIUM PRIORITY (Next Sprint)

### 5. API Security - Other Endpoints
- [ ] **Audit `/api/health.ts`** - No sensitive data ✓
- [ ] **Audit other API endpoints** if any exist
- [ ] **Add authorization pattern** across all endpoints
- [ ] **Implement audit logging** for sensitive operations

### 6. Client-Side Security
- [ ] **Token storage best practice**
  - Using localStorage? Consider sessionStorage instead
  - Consider secure HTTP-only cookies
  - Implement token expiration handling

- [ ] **Audit sensitive data in logs**
  - Remove email/phone from console logs
  - Check Network tab for exposed data
  - Review error messages for PII leakage

- [ ] **CORS configuration**
  - Verify origin restrictions
  - Check Supabase CORS settings
  - Ensure `vercel.json` has proper security headers

### 7. Frontend - Component Audit
- [ ] **Check form components** for autocomplete vulnerabilities
  - `EditProfileForm.jsx`
  - `PatientInfoForm.jsx`
  - Disable autocomplete on password fields ✓

- [ ] **Check error messages** for sensitive data
  - Don't expose user IDs
  - Don't confirm whether email exists
  - Generic error messages only

---

## 📋 DOCUMENTATION & COMPLIANCE

### 8. Documentation
- [ ] Update `README.md` with security notes
- [ ] Document all RLS policies
- [ ] Create runbook for incident response
- [ ] Document approved data access patterns

### 9. Monitoring & Logging
- [ ] Set up Supabase audit logs
- [ ] Monitor for unusual query patterns
- [ ] Alert on policy violations
- [ ] Regular security review schedule

---

## 📚 Reference Documents

- **SECURITY_ADVISORY.md** - Full vulnerability details
- **API_SECURITY_FIX.md** - API authentication implementation
- **sql/001_fix_rls_vulnerability.sql** - Database fix

---

## Testing Command Reference

```bash
# Test database access (direct REST API)
curl -H "Authorization: Bearer <TOKEN>" \
  "https://<PROJECT>.supabase.co/rest/v1/users"

# Test with Supabase CLI
supabase sql "SELECT * FROM users;"

# Check active policies
supabase sql "
  SELECT policyname, cmd, roles, using_clause 
  FROM pg_policies 
  WHERE tablename = 'users';
"
```

---

## Sign-Off

- [ ] Security team review
- [ ] QA testing complete
- [ ] Deployment scheduled
- [ ] Incident resolved
- [ ] Post-mortem documented

---

**Owner:** Security Team  
**Next Review:** 2026-06-07  
**Emergency Contact:** [Add here]
