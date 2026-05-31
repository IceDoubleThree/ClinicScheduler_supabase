import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * ============================================================
 * SECURITY: Authentication & Authorization Middleware
 * ============================================================
 * 
 * All API routes should use these functions to ensure:
 * ✓ Valid JWT tokens are required
 * ✓ Only authorized users can access data
 * ✓ Role-based access control (RBAC) is enforced
 * ✓ Proper error handling without leaking information
 * ✓ Request validation
 */

export interface AuthenticatedRequest extends VercelRequest {
  userId: string;
  userEmail: string;
  userType?: string;
}

/**
 * Extract and validate JWT token from Authorization header
 * 
 * @param req - VercelRequest
 * @returns User ID if valid, null if invalid
 */
export async function extractAndValidateToken(
  req: VercelRequest
): Promise<{ userId: string; userEmail: string } | null> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7);

    // Validate token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      logSecurityEvent('INVALID_TOKEN', {
        ip: req.headers['x-forwarded-for'] || 'unknown',
        path: req.url,
      });
      return null;
    }

    return {
      userId: data.user.id,
      userEmail: data.user.email || '',
    };
  } catch (err) {
    logSecurityEvent('TOKEN_VALIDATION_ERROR', { error: String(err) });
    return null;
  }
}

/**
 * Require authentication on a request
 * Returns 401 if no valid token
 * 
 * @param req - VercelRequest
 * @param res - VercelResponse
 * @returns User info if authenticated
 */
export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ userId: string; userEmail: string } | null> {
  const auth = await extractAndValidateToken(req);

  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="ClinicScheduler API"');
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Valid authentication token required',
    });
    return null;
  }

  return auth;
}

/**
 * Check if user has required role(s)
 * 
 * @param userId - User ID to check
 * @param allowedRoles - Array of allowed roles
 * @returns true if user has one of the allowed roles
 */
export async function checkUserRole(
  userId: string,
  allowedRoles: string[]
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_type')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return allowedRoles.includes(data.user_type);
  } catch (err) {
    logSecurityEvent('ROLE_CHECK_ERROR', { userId, error: String(err) });
    return false;
  }
}

/**
 * Require specific role(s)
 * Returns 403 if user doesn't have required role
 * 
 * @param userId - User ID to check
 * @param res - VercelResponse
 * @param allowedRoles - Array of allowed roles
 * @returns true if authorized
 */
export async function requireRole(
  userId: string,
  res: VercelResponse,
  allowedRoles: string[]
): Promise<boolean> {
  const hasRole = await checkUserRole(userId, allowedRoles);

  if (!hasRole) {
    logSecurityEvent('UNAUTHORIZED_ROLE', {
      userId,
      requiredRoles: allowedRoles,
    });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Insufficient permissions',
    });
    return false;
  }

  return true;
}

/**
 * Require that user can only access their own data
 * Returns 403 if trying to access other user's data
 * 
 * @param userId - Authenticated user ID
 * @param targetId - ID of resource being accessed
 * @param res - VercelResponse
 * @returns true if authorized
 */
export function requireOwnershipOrAdmin(
  userId: string,
  targetId: string,
  res: VercelResponse,
  userType?: string
): boolean {
  const isOwner = userId === targetId;
  const isAdmin = userType === 'admin';

  if (!isOwner && !isAdmin) {
    logSecurityEvent('UNAUTHORIZED_ACCESS', {
      userId,
      targetId,
      method: 'requireOwnershipOrAdmin',
    });
    res.status(403).json({
      error: 'Forbidden',
      message: 'You can only access your own data',
    });
    return false;
  }

  return true;
}

/**
 * Set security headers on response
 */
export function setSecurityHeaders(res: VercelResponse): void {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Disable client-side caching for sensitive endpoints
  res.setHeader(
    'Cache-Control',
    'private, no-cache, no-store, must-revalidate'
  );
  res.setHeader('Expires', '0');

  // Rate limiting headers (basic)
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', '99');
  res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 3600));
}

/**
 * Validate and sanitize string input
 */
export function sanitizeString(input: unknown, fieldName: string): string | null {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // Prevent excessive length
  if (trimmed.length > 255) {
    throw new Error(`${fieldName} exceeds maximum length of 255 characters`);
  }

  // Prevent empty strings
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed;
}

/**
 * Validate UUID format
 */
export function isValidUUID(id: unknown): boolean {
  if (typeof id !== 'string') return false;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Log security events for monitoring
 */
function logSecurityEvent(
  eventType: string,
  details: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  console.warn(`[SECURITY] ${timestamp} ${eventType}:`, details);

  // TODO: Send to monitoring service (e.g., Sentry, DataDog)
  // Example: sentryClient.captureMessage(`Security event: ${eventType}`, {level: 'warning'});
}

/**
 * Wrap API handler with security middleware
 */
export function withSecurityHeaders(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // Set security headers on all responses
    setSecurityHeaders(res);

    // Add CORS for your domain
    const allowedOrigins = [
      'https://myclinic-navy.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
    ];

    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    try {
      await handler(req, res);
    } catch (err: any) {
      console.error('[API Error]', err);

      // Don't leak internal error details to client
      const status = err?.status || 500;
      const message =
        status === 500
          ? 'Internal server error'
          : err?.message || 'An error occurred';

      res.status(status).json({ error: message });
    }
  };
}
