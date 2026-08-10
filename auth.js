// backend/middleware/auth.js
const crypto = require('crypto');

/**
 * Authenticate user from JWT cookie.
 * Attaches decoded payload (sub, username, role, fullName) to req.user.
 */
function authenticateCookie(req, res, next) {
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error("JWT_SECRET environment variable is not defined");
            return res.status(500).json({
                success: false,
                message: "Authentication server configuration error"
            });
        }

        // 1. Parse token from Authorization header or cookie
        let token = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7).trim();
        } else if (req.headers.cookie) {
            const cookies = {};
            req.headers.cookie.split(';').forEach(c => {
                const eqIdx = c.indexOf('=');
                if (eqIdx !== -1) {
                    const name = c.substring(0, eqIdx).trim();
                    const value = c.substring(eqIdx + 1).trim();
                    cookies[name] = value;
                }
            });
            token = cookies.__session || cookies.token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token missing"
            });
        }

        // 2. Parse and verify JWT
        const parts = token.split('.');
        if (parts.length !== 3) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token format"
            });
        }

        const [header, payload, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', secret)
                                  .update(`${header}.${payload}`)
                                  .digest('base64url');

        if (signature !== expectedSig) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token signature"
            });
        }

        // 3. Verify expiration
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (decodedPayload.exp < Date.now() / 1000) {
            return res.status(401).json({
                success: false,
                message: "Authentication token expired"
            });
        }

        // 4. Check if user is active
        if (decodedPayload.is_active === false) {
            return res.status(403).json({
                success: false,
                message: "Account has been deactivated. Contact the administrator."
            });
        }

        // 5. Attach user context and proceed
        req.user = decodedPayload;
        next();

    } catch (err) {
        console.error("Authentication middleware error:", err.message);
        return res.status(401).json({
            success: false,
            message: "Authentication failed"
        });
    }
}

/**
 * Role-based authorization middleware.
 * Usage: requireRole('super_admin') or requireRole('super_admin', 'doctor')
 * Must be used AFTER authenticateCookie.
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.'
            });
        }
        next();
    };
}

module.exports = { authenticateCookie, requireRole };
