export interface AppConfig {
  env: string;
  port: number;
  logLevel: string;
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  medplum: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
  };
  llm: {
    anthropicApiKey: string;
    openaiApiKey: string;
  };
}

export const configuration = (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  },
  medplum: {
    baseUrl: process.env.MEDPLUM_BASE_URL ?? 'https://api.medplum.com/',
    clientId: process.env.MEDPLUM_CLIENT_ID ?? '',
    clientSecret: process.env.MEDPLUM_CLIENT_SECRET ?? '',
  },
  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  },
});
