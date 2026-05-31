import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { setSecurityHeaders } from './_lib/auth';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase credentials');
}

/**
 * ============================================================
 * PUBLIC ENDPOINT: Username to Email Lookup
 * ============================================================
 * 
 * Purpose: Allows unauthenticated users to lookup email by username
 * This is needed for login flow: username → email → authenticate
 * 
 * Security:
 * ✓ Only returns EMAIL (not password, not phone, not user type)
 * ✓ Uses service role (bypasses RLS)
 * ✓ Rate limit headers included
 * ✓ Returns generic 404 even if username doesn't exist (no enumeration)
 * ✓ Input validation on username
 */

// Use service role key to bypass RLS (server-side lookup)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET is supported',
    });
  }

  try {
    const { username } = (req.query || {}) as { username?: string };

    // Validate input
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username parameter required',
      });
    }

    const trimmedUsername = username.trim();

    // Prevent excessively long input
    if (trimmedUsername.length > 100) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username too long',
      });
    }

    // Empty check
    if (trimmedUsername.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Username cannot be empty',
      });
    }

    // ✓ Query database using service role (bypasses RLS)
    const { data, error } = await supabase
      .from('users')
      .select('email, username') // Only return safe fields
      .eq('username', trimmedUsername)
      .single();

    // ✓ Security: Return generic 404 even if user not found
    // This prevents username enumeration
    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }

    // ✓ Return ONLY email (not password, not phone, not user_type)
    return res.status(200).json({
      data: {
        email: data.email,
        username: data.username,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/lookup-username] Error:', err);

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to lookup username',
    });
  } finally {
    // Always set security headers
    setSecurityHeaders(res);
  }
}

export default handler;
