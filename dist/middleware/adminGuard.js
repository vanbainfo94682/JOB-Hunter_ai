"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminIpGuard = adminIpGuard;
// Define your trusted IPs here (or load from environment variables)
const WHITELISTED_IPS = (process.env.ADMIN_IPS || '127.0.0.1').split(',');
function adminIpGuard(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress;
    // Note: If behind a proxy, use req.headers['x-forwarded-for']
    if (!WHITELISTED_IPS.includes(clientIp)) {
        return res.status(403).json({ error: 'Access forbidden: Unauthorized IP address.' });
    }
    next();
}
