import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';

type SupabaseUser = { id: string; email?: string };

/**
 * How long a token Supabase accepted is trusted without asking again. Each
 * check is an HTTP round trip to Supabase; a phone asking several questions
 * reuses one access token. A sign-out or revocation takes effect within this
 * window, and never beyond the token's own expiry.
 */
const VERIFIED_TTL_MS = 60_000;
const MAX_CACHED_TOKENS = 5_000;

/** Accepted tokens, keyed by SHA-256 of the token (the token itself is never kept). */
const verified = new Map<string, { user: SupabaseUser; expires: number }>();

/**
 * Authenticates a request using the caller's Supabase session (the same login
 * the mobile app already does). We validate the bearer access token against
 * Supabase's `/auth/v1/user` endpoint — this needs only the public project URL
 * + anon key (no JWT secret to manage) and honours revocation/expiry server
 * side, up to VERIFIED_TTL_MS after a token was last checked. On success the
 * verified user is attached as `req.supabaseUser`.
 *
 * Config (env on the backend deployment):
 *   SUPABASE_URL        — e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY   — the public anon key
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly url = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '');
  private readonly anon = process.env.SUPABASE_ANON_KEY ?? '';

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      supabaseUser?: SupabaseUser;
    }>();

    if (!this.url || !this.anon) {
      throw new UnauthorizedException('Sign-in is not configured on this server.');
    }

    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Missing session token.');

    const key = createHash('sha256').update(token).digest('hex');
    const now = Date.now();
    const cached = verified.get(key);
    if (cached && cached.expires > now) {
      req.supabaseUser = cached.user;
      return true;
    }

    let res: Response;
    try {
      res = await fetch(`${this.url}/auth/v1/user`, {
        headers: { authorization: `Bearer ${token}`, apikey: this.anon },
      });
    } catch {
      throw new UnauthorizedException('Could not verify your session.');
    }
    if (!res.ok) throw new UnauthorizedException('Invalid or expired session.');

    const user = (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
    if (!user?.id) throw new UnauthorizedException('Invalid session.');

    req.supabaseUser = { id: user.id, email: user.email };
    remember(key, req.supabaseUser, now, tokenExpiry(token));
    return true;
  }
}

function remember(key: string, user: SupabaseUser, now: number, tokenExpires?: number): void {
  const expires = Math.min(now + VERIFIED_TTL_MS, tokenExpires ?? Infinity);
  if (expires <= now) return;
  verified.delete(key);
  if (verified.size >= MAX_CACHED_TOKENS) verified.delete(verified.keys().next().value!);
  verified.set(key, { user, expires });
}

/**
 * The token's `exp` in milliseconds, read without verifying the signature —
 * only to cap how long an answer Supabase already gave is reused.
 */
function tokenExpiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/** Test hook: forget every verified token. */
export function clearVerifiedSessions(): void {
  verified.clear();
}
