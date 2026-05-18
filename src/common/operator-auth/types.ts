/**
 * Authenticated operator (an integrator admin, content reviewer, or
 * tenant administrator) attached to the request once the
 * OperatorAuthGuard has accepted it.
 */
export interface AuthenticatedOperator {
  /** OIDC subject (sub claim) or dev-bypass synthetic id. */
  sub: string;
  /** Integrator the operator acts on behalf of. */
  integratorId: string;
  /** True when the operator passed via the dev bypass, not OIDC. */
  viaDevBypass: boolean;
  /** Raw claims from the verified JWT, or null in dev-bypass mode. */
  claims: Record<string, unknown> | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    operator?: AuthenticatedOperator;
  }
}
