import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Holiday } from '../types';
import { getUAEDateString } from '../utils/timezone';

const HOLIDAYS_SETTING_KEY = '__SYSTEM_HOLIDAYS_LIST__';

export class HybridHolidayService {
  async getAllHolidays(): Promise<Holiday[]> {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('username', HOLIDAYS_SETTING_KEY)
          .maybeSingle();

        if (data && data.password_hash) {
          try {
            const list: Holiday[] = JSON.parse(data.password_hash);
            // Sync to local Dexie
            for (const h of list) {
              const local = await db.holidays.where('date').equals(h.date).first();
              if (!local) {
                await db.holidays.add({ date: h.date, name: h.name, createdAt: h.createdAt });
              }
            }
            return list;
          } catch (e) {
            console.warn('Failed to parse holidays list JSON:', e);
          }
        }
      }

      // Dexie fallback
      return await db.holidays.toArray();
    } catch (err) {
      console.warn('Failed to load holidays:', err);
    }
    return await db.holidays.toArray();
  }

  async addHoliday(date: string, name: string): Promise<{ success: boolean; holiday?: Holiday; error?: string }> {
    try {
      const currentList = await this.getAllHolidays();
      if (currentList.some((h) => h.date === date)) {
        return { success: false, error: `A holiday is already registered for date ${date}.` };
      }

      const newHoliday: Holiday = {
        date,
        name,
        createdAt: getUAEDateString(),
      };

      // Add to Dexie
      const id = await db.holidays.add(newHoliday);
      newHoliday.id = id;

      const updatedList = [...currentList, newHoliday];

      // Sync to Supabase central cloud
      if (isSupabaseConfigured && supabase) {
        await supabase.from('users').upsert(
          {
            username: HOLIDAYS_SETTING_KEY,
            password_hash: JSON.stringify(updatedList),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );
      }

      return { success: true, holiday: newHoliday };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add holiday.' };
    }
  }

  async deleteHoliday(date: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.holidays.where('date').equals(date).delete();
      const currentList = await this.getAllHolidays();
      const updatedList = currentList.filter((h) => h.date !== date);

      if (isSupabaseConfigured && supabase) {
        await supabase.from('users').upsert(
          {
            username: HOLIDAYS_SETTING_KEY,
            password_hash: JSON.stringify(updatedList),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete holiday.' };
    }
  }
}

export const holidayService = new HybridHolidayService();
