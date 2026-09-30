import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';

export const DEFAULT_HANGARS: string[] = [
  'Hangar 1',
  'Hangar 2',
  'Hangar 3',
  'Hangar 4',
  'Hangar 5',
  'Hangar 6A',
  'Hangar 6B',
  'Hangar 6C',
  'Hangar 7',
  'Line Maintenance / Apron',
  'Paint Hangar',
  'Component Workshop',
];

const HANGARS_SETTING_KEY = '__SYSTEM_HANGARS_LIST__';
const DEXIE_HANGARS_KEY = 'hangars_list';

export class HybridHangarService {
  private cachedHangars: string[] | null = null;

  private async saveToDexie(hangars: string[]): Promise<void> {
    try {
      const local = await db.settings.where('key').equals(DEXIE_HANGARS_KEY).first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: hangars });
      } else {
        await db.settings.add({ key: DEXIE_HANGARS_KEY, value: hangars });
      }
    } catch (e) {
      console.warn('Failed to cache hangars in Dexie:', e);
    }
  }

  async getHangars(): Promise<string[]> {
    // 1. Return in-memory cache if available (prevents race conditions & network jitter)
    if (this.cachedHangars !== null) {
      return [...this.cachedHangars];
    }

    try {
      // 2. Fetch from Supabase central cloud
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('username', HANGARS_SETTING_KEY)
          .maybeSingle();

        if (data && typeof data.password_hash === 'string') {
          try {
            const parsed = JSON.parse(data.password_hash);
            if (Array.isArray(parsed)) {
              this.cachedHangars = parsed;
              await this.saveToDexie(parsed);
              return [...parsed];
            }
          } catch (e) {
            console.warn('Failed to parse hangars JSON from Supabase:', e);
          }
        }
      }

      // 3. Fallback to Dexie local cache
      const local = await db.settings.where('key').equals(DEXIE_HANGARS_KEY).first();
      if (local && Array.isArray(local.value)) {
        this.cachedHangars = local.value;
        return [...local.value];
      }

      // 4. Default to empty list if not yet initialized
      this.cachedHangars = [];
      await this.saveHangars([]);
      return [];
    } catch (err) {
      console.warn('Error fetching hangars list:', err);
      return this.cachedHangars ? [...this.cachedHangars] : [];
    }
  }

  async saveHangars(hangars: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      // Clean, trim, and deduplicate
      const seen = new Set<string>();
      const cleanHangars: string[] = [];

      for (const h of hangars) {
        const trimmed = (h || '').trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase());
          cleanHangars.push(trimmed);
        }
      }

      // Update in-memory cache immediately
      this.cachedHangars = cleanHangars;

      // 1. Save to Dexie local database
      await this.saveToDexie(cleanHangars);

      // 2. Save to Supabase cloud
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').upsert(
          {
            username: HANGARS_SETTING_KEY,
            password_hash: JSON.stringify(cleanHangars),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );

        if (error) {
          console.warn('Supabase save error for hangars:', error.message);
          return { success: false, error: error.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save hangars list' };
    }
  }

  async addHangar(name: string): Promise<{ success: boolean; hangars?: string[]; error?: string }> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return { success: false, error: 'Hangar name cannot be empty.' };
    }

    const current = this.cachedHangars ?? (await this.getHangars());
    const alreadyExists = current.some((h) => h.toLowerCase() === trimmed.toLowerCase());
    if (alreadyExists) {
      return { success: false, error: `Hangar "${trimmed}" already exists.` };
    }

    const updated = [...current, trimmed];
    const saveRes = await this.saveHangars(updated);
    if (!saveRes.success) {
      return saveRes;
    }

    try {
      await db.auditLogs.add({
        user: 'selva.master',
        action: `Added Facility Hangar: ${trimmed}`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });
    } catch {
      // non-blocking
    }

    return { success: true, hangars: updated };
  }

  async deleteHangar(name: string): Promise<{ success: boolean; hangars?: string[]; error?: string }> {
    const trimmed = (name || '').trim();
    const current = this.cachedHangars ?? (await this.getHangars());
    const updated = current.filter((h) => h.toLowerCase() !== trimmed.toLowerCase());

    const saveRes = await this.saveHangars(updated);
    if (!saveRes.success) {
      return saveRes;
    }

    try {
      await db.auditLogs.add({
        user: 'selva.master',
        action: `Deleted Facility Hangar: ${trimmed}`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });
    } catch {
      // non-blocking
    }

    return { success: true, hangars: updated };
  }

  async clearAllHangars(): Promise<{ success: boolean; hangars?: string[]; error?: string }> {
    const saveRes = await this.saveHangars([]);
    if (!saveRes.success) {
      return saveRes;
    }

    try {
      await db.auditLogs.add({
        user: 'selva.master',
        action: 'Cleared All Facility Hangars',
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });
    } catch {
      // non-blocking
    }

    return { success: true, hangars: [] };
  }

  async resetToDefaults(): Promise<{ success: boolean; hangars?: string[]; error?: string }> {
    const saveRes = await this.saveHangars(DEFAULT_HANGARS);
    if (!saveRes.success) {
      return saveRes;
    }

    try {
      await db.auditLogs.add({
        user: 'selva.master',
        action: 'Reset Facility Hangars to Default List',
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });
    } catch {
      // non-blocking
    }

    return { success: true, hangars: DEFAULT_HANGARS };
  }
}

export const hangarService = new HybridHangarService();
