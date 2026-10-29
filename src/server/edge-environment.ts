/** Supabase's environment is read-only. Keep app aliases in a private object, never Deno.env.set(). */
export function createEdgeEnvironment(source: Record<string, string | undefined>) {
  return {
    NODE_ENV: 'production',
    DEMO_MODE: 'false',
    DATA_ADAPTER: 'supabase',
    COOKIE_SECURE: 'true',
    ENABLE_SCHEDULER: 'false',
    CENTER_TIMEZONE: 'America/Los_Angeles',
    NEXT_PUBLIC_SUPABASE_URL: source.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    PRODUCTION_DATA_APPROVED: source.ARITHMETICA_DATA_APPROVED,
    DEPLOYMENT_ENV: source.ARITHMETICA_ENVIRONMENT,
    APP_ORIGIN: source.ARITHMETICA_APP_ORIGIN,
    CENTER_ID: source.ARITHMETICA_CENTER_ID,
    SESSION_SECRET: source.ARITHMETICA_SESSION_SECRET,
    JOBS_SECRET: source.ARITHMETICA_JOBS_SECRET,
    DICTATION_PRIVACY_APPROVED: source.DICTATION_PRIVACY_APPROVED,
    DICTATION_APPROVAL_REFERENCE: source.DICTATION_APPROVAL_REFERENCE,
  };
}
export const arithmeticaEnvironment = createEdgeEnvironment(globalThis.process?.env || {});
