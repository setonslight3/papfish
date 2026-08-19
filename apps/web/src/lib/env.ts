/**
 * Environment configuration.
 *
 * Only public values are read here: the Supabase anon key is designed to be
 * shipped to browsers and is protected by Row Level Security. The service-role
 * key is never referenced by client code - it exists only in the pipeline.
 */
const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** True when a Supabase project is configured; otherwise the app runs on local storage. */
  supabaseConfigured: url.length > 0 && anonKey.length > 0,
  /**
   * Allow the client to query the public Lichess opening explorer for positions
   * that the pipeline has not aggregated yet. Set to "false" to rely purely on
   * the statistics table.
   */
  liveExplorerEnabled: (import.meta.env.VITE_ENABLE_LIVE_EXPLORER ?? 'true') !== 'false',
  explorerBaseUrl:
    import.meta.env.VITE_LICHESS_EXPLORER_URL?.trim() || 'https://explorer.lichess.ovh',
  enginePath: import.meta.env.VITE_ENGINE_PATH?.trim() || '/engine/stockfish-18-lite-single.js',
} as const;

export type Backend = 'supabase' | 'local';

export const backend: Backend = env.supabaseConfigured ? 'supabase' : 'local';
