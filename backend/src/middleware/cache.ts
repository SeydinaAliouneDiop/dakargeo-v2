import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export const CACHE_TTL = {
  stats:   5 * 60 * 1000,  // 5 min — stats changent peu
  geojson: 2 * 60 * 1000,  // 2 min — données géo
  lieux:   10 * 60 * 1000, // 10 min — lieux stables
};

export function cacheGet(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function cacheSet(key: string, data: any, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

export function cacheDelete(key: string): void {
  cache.delete(key);
}

export function cacheClear(): void {
  cache.clear();
}

export function cacheStats() {
  const now = Date.now();
  let valid = 0, expired = 0;
  cache.forEach(entry => {
    if (now > entry.expiresAt) expired++;
    else valid++;
  });
  return { total: cache.size, valid, expired };
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitStore.get(ip);

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      return res.status(429).json({
        error: 'Trop de requêtes',
        message: `Réessaie dans ${retryAfter} secondes`,
        retryAfter,
      });
    }

    entry.count++;
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - entry.count);
    next();
  };
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  
  const publicRoutes = ['/api/health', '/api/lieux', '/api/batiments/dashboard',
                        '/api/batiments/zones', '/api/batiments/classes'];
  const isPublic = publicRoutes.some(r => req.path === r || req.path.startsWith(r));
  if (isPublic) return next();

  const key = req.headers['x-api-key'] as string;
  const validKey = process.env.API_KEY;

  if (!validKey) return next(); // Pas de clé configurée = mode dev
  if (!key || key !== validKey) {
    return res.status(401).json({
      error: 'Clé API manquante ou invalide',
      hint: 'Ajoute le header: x-api-key: ta_cle',
    });
  }
  next();
}

export const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowed = [
      process.env.FRONTEND_URL || 'https://dakargeo-v2.vercel.app',
      'http://localhost:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
    ];
    
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); 
    }
  },
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
};