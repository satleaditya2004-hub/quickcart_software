import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import 'dotenv/config';
import { db } from './db.js';

function requireSecret(name: 'JWT_SECRET' | 'REFRESH_SECRET'): string {
  const secret = process.env[name];
  if (!secret || secret.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters`);
  }
  return secret;
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const REFRESH_SECRET = requireSecret('REFRESH_SECRET');

export interface AuthUser {
  id: string;
  staff_code?: string;
  email: string;
  role: 'admin' | 'staff';
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateTokens(user: AuthUser, sessionId: string = randomUUID()) {
  const accessToken = jwt.sign(
    { id: user.id, staff_code: user.staff_code, email: user.email, role: user.role, sessionId },
    JWT_SECRET,
    { expiresIn: '15m', jwtid: randomUUID() }
  );
  const refreshToken = jwt.sign(
    { id: user.id, staff_code: user.staff_code, email: user.email, role: user.role, sessionId },
    REFRESH_SECRET,
    { expiresIn: '7d', jwtid: randomUUID() }
  );
  return { accessToken, refreshToken, sessionId };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function matchesRefreshToken(token: string, tokenHash: string): boolean {
  const actualHash = Buffer.from(hashRefreshToken(token), 'hex');
  const expectedHash = Buffer.from(tokenHash, 'hex');
  return actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    if (!payload.id || !payload.email || !payload.sessionId || !['admin', 'staff'].includes(payload.role)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET) as AuthUser;
    if (!payload.id || !payload.email || !payload.sessionId || !['admin', 'staff'].includes(payload.role)) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

// Authentication middleware
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.split(' ')[1];
  const user = verifyAccessToken(token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
  }

  const session = db.prepare(`
    SELECT r.expires_at
    FROM refresh_tokens r
    JOIN users u ON u.id = r.user_id
    WHERE r.id = ? AND r.user_id = ? AND r.revoked_at IS NULL AND u.active = 1
  `).get(user.sessionId, user.id) as { expires_at: string } | undefined;
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    return res.status(401).json({ error: 'Unauthorized: Session has been revoked' });
  }

  req.user = user;
  next();
}

// Role-based access control
export function requireRole(...allowedRoles: ('admin' | 'staff')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges for this role' });
    }
    next();
  };
}
