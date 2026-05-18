import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';

@Injectable()
export class IdentityService {
  constructor(private readonly supabase: SupabaseService) {}

  async verifyAccessToken(token: string): Promise<{ userId: string } | null> {
    try {
      const { data, error } = await this.supabase.admin().auth.getUser(token);
      if (error || !data?.user) return null;
      return { userId: data.user.id };
    } catch {
      return null;
    }
  }
}
