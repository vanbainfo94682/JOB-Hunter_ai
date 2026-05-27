import { Request, Response, NextFunction } from 'express';

// Define your trusted IPs here (or load from environment variables)
const WHITELISTED_IPS = (process.env.ADMIN_IPS || '127.0.0.1').split(',');

export function adminIpGuard(req: Request, res: Response, next: NextFunction) {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  // Note: If behind a proxy, use req.headers['x-forwarded-for']
  if (!WHITELISTED_IPS.includes(clientIp as string)) {
    return res.status(403).json({ error: 'Access forbidden: Unauthorized IP address.' });
  }
  next();
}
