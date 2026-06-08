import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Authenticates a request using the caller's Supabase session (the same login
 * the mobile app already does). We validate the bearer access token against
 * Supabase's `/auth/v1/user` endpoint — this needs only the public project URL
 * + anon key (no JWT secret to manage) and honours revocation/expiry server
 * side. On success the verified user is attached as `req.supabaseUser`.
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
      supabaseUser?: { id: string; email?: string };
    }>();

    if (!this.url || !this.anon) {
      throw new UnauthorizedException('Sign-in is not configured on this server.');
    }

    const header = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Missing session token.');

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
    return true;
  }
}
