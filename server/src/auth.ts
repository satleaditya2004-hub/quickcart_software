import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'quickkart-secure-super-jwt-secret-2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'quickkart-refresh-token-secret-2026';

export interface AuthUser {
  id: string;
  staff_code?: string;
  email: string;
  role: 'admin' | 'staff';
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateTokens(user: AuthUser) {
  const accessToken = jwt.sign(
    { id: user.id, staff_code: user.staff_code, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, staff_code: user.staff_code, email: user.email, role: user.role },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as AuthUser;
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
