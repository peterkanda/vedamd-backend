import { SetMetadata } from '@nestjs/common';
import type { ApiKeyScope } from '../../modules/developer/api-keys.service';

export const REQUIRED_SCOPES_KEY = 'vedamd:required-scopes';

/**
 * Declare the scopes a route requires of the calling API key.
 * Enforced by `ApiKeyGuard`.
 */
export const RequireScope = (...scopes: ApiKeyScope[]) => SetMetadata(REQUIRED_SCOPES_KEY, scopes);
