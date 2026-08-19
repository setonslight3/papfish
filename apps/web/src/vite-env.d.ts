/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_LIVE_EXPLORER?: string;
  readonly VITE_LICHESS_EXPLORER_URL?: string;
  readonly VITE_ENGINE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
