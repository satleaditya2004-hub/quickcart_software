import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'quickkart-secure-super-jwt-secret-2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'quickkart-refresh-token-secret-2026';
export function generateTokens(user) {
    const accessToken = jwt.sign({ id: user.id, staff_code: user.staff_code, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id, staff_code: user.staff_code, email: user.email, role: user.role }, REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}
export function verifyAccessToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch (err) {
        return null;
    }
}
export function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, REFRESH_SECRET);
    }
    catch (err) {
        return null;
    }
}
// Authentication middleware
export function requireAuth(req, res, next) {
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
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges for this role' });
        }
        next();
    };
}
