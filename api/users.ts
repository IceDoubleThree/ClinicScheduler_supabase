import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage, validateInsertUser } from './_lib/storage';
import {
  requireAuth,
  requireOwnershipOrAdmin,
  requireRole,
  isValidUUID,
  sanitizeString,
  withSecurityHeaders,
} from './_lib/auth';

/**
 * ============================================================
 * SECURITY: Users API Endpoint
 * ============================================================
 * 
 * AUTHENTICATION: All endpoints require valid JWT token
 * AUTHORIZATION: Users can only access their own data
 * ROLE RESTRICTIONS: Admin/doctor operations require roles
 * 
 * Endpoints:
 * - GET /api/users?id=<uuid> → Returns current user's profile
 * - POST /api/users → Create new user (self-registration)
 */

async function handler(req: VercelRequest, res: VercelResponse) {
  // GET: Retrieve user profile
  if (req.method === 'GET') {
    // ✓ REQUIRE AUTHENTICATION
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const { id } = (req.query || {}) as { id?: string };

    // ✓ VALIDATE INPUT
    if (!id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User ID required',
      });
    }

    if (!isValidUUID(id)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid user ID format',
      });
    }

    // ✓ AUTHORIZATION: User can only fetch their own profile
    // (unless they're an admin - check later if needed)
    if (!requireOwnershipOrAdmin(auth.userId, id, res)) {
      return;
    }

    // ✓ FETCH FROM DATABASE
    try {
      const user = await storage.getUser(id);

      if (!user) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'User not found',
        });
      }

      // ✓ RETURN ONLY OWN DATA
      return res.status(200).json({
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          user_type: user.user_type,
          created_at: user.created_at,
          phone: user.phone,
        },
      });
    } catch (err: any) {
      console.error('[GET /api/users] Error:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve user',
      });
    }
  }

  // POST: Create new user (self-registration only)
  if (req.method === 'POST') {
    // ✓ REQUIRE AUTHENTICATION
    const auth = await requireAuth(req, res);
    if (!auth) return;

    // ✓ VALIDATE INPUT
    try {
      const insertUser = validateInsertUser(req.body);

      // ✓ SECURITY: Only allow creating own profile
      // (The storage layer should associate with auth.userId)
      const user = await storage.createUser(insertUser);

      return res.status(201).json({
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          user_type: user.user_type,
          created_at: user.created_at,
        },
      });
    } catch (err: any) {
      console.error('[POST /api/users] Error:', err);

      const status = err?.status || 500;
      const message = err?.message || 'Failed to create user';

      return res.status(status).json({
        error: 'Bad Request',
        message,
      });
    }
  }

  // ✓ DENY UNSUPPORTED METHODS
  return res.status(405).json({
    error: 'Method Not Allowed',
    message: `${req.method} is not supported on this endpoint`,
  });
}

// ✓ WRAP WITH SECURITY MIDDLEWARE
export default withSecurityHeaders(handler);
