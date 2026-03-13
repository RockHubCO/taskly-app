const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 10; // 10 mensagens por minuto

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userData = rateLimitMap.get(userId);

  if (!userData || now > userData.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + WINDOW_MS });
    return true;
  }

  if (userData.count >= MAX_REQUESTS) {
    return false;
  }

  userData.count++;
  return true;
}
