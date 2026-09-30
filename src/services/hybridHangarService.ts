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
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('username', HANGARS_SETTING_KEY)
          .maybeSingle();

        if (data && data.password_hash) {
          try {
            const parsed = JSON.parse(data.password_hash);
            if (Array.isArray(parsed) && parsed.length > 0) {
              await this.saveToDexie(parsed);
              return parsed;
            }
          } catch (e) {
            console.warn('Failed to parse hangars JSON from Supabase:', e);
          }
        }
      }

      // Check Dexie cache
      const local = await db.settings.where('key').equals(DEXIE_HANGARS_KEY).first();
      if (local && Array.isArray(local.value) && local.value.length > 0) {
        return local.value;
      }

      // Seed with DEFAULT_HANGARS if empty
      await this.saveHangars(DEFAULT_HANGARS);
      return DEFAULT_HANGARS;
    } catch (err) {
      console.warn('Error fetching hangars list, falling back to defaults:', err);
      return DEFAULT_HANGARS;
    }
  }

  async saveHangars(hangars: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      // Clean, trim, and remove empty or duplicate entries
      const seen = new Set<string>();
      const cleanHangars: string[] = [];

      for (const h of hangars) {
        const trimmed = (h || '').trim();
        if (trimmed && !seen.has(trimmed.toLowerCase())) {
          seen.add(trimmed.toLowerCase());
          cleanHangars.push(trimmed);
        }
      }

      // 1. Save to Dexie
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

    const current = await this.getHangars();
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
    const current = await this.getHangars();
    const updated = current.filter((h) => h.toLowerCase() !== trimmed.toLowerCase());

    if (updated.length === 0) {
      return { success: false, error: 'Cannot delete all hangars. At least one hangar must remain.' };
    }

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
