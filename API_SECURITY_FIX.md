# API Security Fix: Add Authentication to User Endpoints

## Issue

The `/api/users.ts` endpoint allows unauthenticated users to query user information:

```typescript
// ❌ VULNERABLE - No auth check
if (id) {
  const user = await storage.getUser(String(id));
  return res.status(200).json({ user });
}
if (username) {
  const user = await storage.getUserByUsername(String(username));
  return res.status(200).json({ user });
}
```

This allows:
- Username enumeration
- Email lookup (if returned)
- Information gathering for targeted attacks

---

## Fix: Add Authentication Middleware

### Option 1: Direct Auth Check (Simple)

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { storage, validateInsertUser } from './_lib/storage';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ✓ Add auth check for all requests
    const token = req.headers.authorization?.split('Bearer ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Missing authorization token' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const currentUserId = data.user.id;

    if (req.method === 'GET') {
      const { id, username } = (req.query || {}) as { id?: string; username?: string };

      if (id) {
        // ✓ Only allow users to fetch their own profile
        if (id !== currentUserId) {
          return res.status(403).json({ message: 'Forbidden' });
        }
        const user = await storage.getUser(String(id));
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json({ user });
      }

      // ❌ Consider: Do you need to expose username lookup?
      // If not, remove this entirely
      if (username) {
        // If needed, check if it's an admin operation
        // const { data: profile } = await supabase
        //   .from('users')
        //   .select('user_type')
        //   .eq('id', currentUserId)
        //   .single();
        // if (profile?.user_type !== 'admin') {
        //   return res.status(403).json({ message: 'Only admins can search by username' });
        // }
        const user = await storage.getUserByUsername(String(username));
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json({ user });
      }

      return res.status(400).json({ message: 'Provide id' });
    }

    if (req.method === 'POST') {
      // POST creates a new user - should this be restricted?
      // Consider: Only allow self-registration
      const insertUser = validateInsertUser(req.body);
      const user = await storage.createUser(insertUser);
      return res.status(201).json({ user });
    }

    return res.status(405).json({ message: 'Method Not Allowed' });
  } catch (err: any) {
    console.error(err);
    const status = err?.status || 500;
    return res.status(status).json({ message: err?.message || 'Internal Server Error' });
  }
}
```

### Option 2: Use Middleware Pattern (Cleaner)

Create `api/_lib/auth.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export interface AuthenticatedRequest extends VercelRequest {
  userId: string;
  userType?: string;
}

export async function requireAuth(req: VercelRequest): Promise<string | null> {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user.id;
}

export async function requireRole(
  userId: string,
  allowedRoles: string[]
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('user_type')
    .eq('id', userId)
    .single();

  return data?.user_type && allowedRoles.includes(data.user_type);
}
```

Then use in `api/users.ts`:

```typescript
import { requireAuth } from './_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const userId = await requireAuth(req);
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.method === 'GET') {
      const { id } = (req.query || {}) as { id?: string };
      
      // Only allow fetching own profile
      if (!id || id !== userId) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      return res.status(200).json({ user });
    }
    // ... rest of handler
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
```

---

## Recommendation

**Preferred approach:** Let RLS handle all authorization at the database layer via REST API. 

Instead of `/api/users.ts`:
- Use `supabase.from('users').select()` directly from the client
- RLS policies enforce access control automatically
- No need for custom API authorization code

Only use `/api/users.ts` if you need:
- Custom business logic
- Server-side validation before DB write
- Admin operations that bypass RLS

---

## Testing

After adding authentication:

```bash
# ✗ Should fail without token
curl "http://localhost:3000/api/users?id=<user-id>"
# Expected: 401 Unauthorized

# ✗ Should fail trying to access other user
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/users?id=<other-user-id>"
# Expected: 403 Forbidden

# ✓ Should succeed for own profile
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/users?id=<current-user-id>"
# Expected: 200 OK + user data
```

---

## Priority

1. **CRITICAL:** Remove `USING (true)` RLS policy → `sql/001_fix_rls_vulnerability.sql`
2. **HIGH:** Add auth to `/api/users.ts` GET endpoints (this guide)
3. **MEDIUM:** Review other API endpoints for similar issues
4. **MEDIUM:** Decide if username lookup should be public or admin-only
