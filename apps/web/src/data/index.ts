import { getSupabase } from '@/lib/supabase';
import { LocalRepository } from './localRepository';
import { SupabaseRepository } from './supabaseRepository';
import type { PapfishRepository } from './types';

let repository: PapfishRepository | null = null;

/** The active storage backend: Supabase when configured, local storage otherwise. */
export function getRepository(): PapfishRepository {
  if (!repository) {
    const supabase = getSupabase();
    repository = supabase ? new SupabaseRepository(supabase) : new LocalRepository();
  }
  return repository;
}

export * from './types';
