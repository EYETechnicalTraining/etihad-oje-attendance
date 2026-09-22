import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { GeofenceSettings } from '../types';

export const DEFAULT_GEOFENCE_SETTINGS: GeofenceSettings = {
  enabled: true,
  centerLatitude: 24.4267,
  centerLongitude: 54.6511,
  loginRadiusMeters: 50,
  signOutRadiusMeters: 500,
};

const GEOFENCE_SETTING_KEY = '__SYSTEM_GEOFENCE_SETTINGS__';

export class HybridSettingsService {
  async getGeofenceSettings(): Promise<GeofenceSettings> {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('username', GEOFENCE_SETTING_KEY)
          .maybeSingle();

        if (data && data.password_hash) {
          try {
            const parsed = JSON.parse(data.password_hash);
            const merged = { ...DEFAULT_GEOFENCE_SETTINGS, ...parsed };
            // Sync to Dexie locally
            const local = await db.settings.where('key').equals('geofence_settings').first();
            if (local && local.id) {
              await db.settings.update(local.id, { value: merged });
            } else {
              await db.settings.add({ key: 'geofence_settings', value: merged });
            }
            return merged;
          } catch (e) {
            console.warn('Failed to parse geofence JSON from users table:', e);
          }
        }
      }

      // Dexie fallback
      const local = await db.settings.where('key').equals('geofence_settings').first();
      if (local && local.value) {
        return { ...DEFAULT_GEOFENCE_SETTINGS, ...local.value };
      }
    } catch (err) {
      console.warn('Failed to load geofence settings, using defaults:', err);
    }
    return DEFAULT_GEOFENCE_SETTINGS;
  }

  async saveGeofenceSettings(settings: GeofenceSettings): Promise<{ success: boolean; error?: string }> {
    try {
      // Save locally to Dexie
      const local = await db.settings.where('key').equals('geofence_settings').first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: settings });
      } else {
        await db.settings.add({ key: 'geofence_settings', value: settings });
      }

      // Save to Supabase central cloud via users table
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').upsert(
          {
            username: GEOFENCE_SETTING_KEY,
            password_hash: JSON.stringify(settings),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );

        if (error) {
          console.warn('Supabase geofence save error:', error.message);
          return { success: false, error: error.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save geofence settings' };
    }
  }
}

export const settingsService = new HybridSettingsService();
