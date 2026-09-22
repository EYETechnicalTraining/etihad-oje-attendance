import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { GeofenceSettings } from '../types';

export const DEFAULT_GEOFENCE_SETTINGS: GeofenceSettings = {
  enabled: true,
  centerLatitude: 24.4267,
  centerLongitude: 54.6511,
  loginRadiusMeters: 500,
  signOutRadiusMeters: 1000,
};

const GEOFENCE_SETTING_KEY = 'geofence_settings';

export class HybridSettingsService {
  async getGeofenceSettings(): Promise<GeofenceSettings> {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.from('settings').select('*').eq('key', GEOFENCE_SETTING_KEY).maybeSingle();
        if (data && data.value) {
          return { ...DEFAULT_GEOFENCE_SETTINGS, ...data.value };
        }
      }

      // Dexie fallback
      const local = await db.settings.where('key').equals(GEOFENCE_SETTING_KEY).first();
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
      const local = await db.settings.where('key').equals(GEOFENCE_SETTING_KEY).first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: settings });
      } else {
        await db.settings.add({ key: GEOFENCE_SETTING_KEY, value: settings });
      }

      // Save to Supabase
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('settings').upsert({
          key: GEOFENCE_SETTING_KEY,
          value: settings,
        }, { onConflict: 'key' });

        if (error) {
          console.warn('Supabase geofence save error:', error.message);
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save geofence settings' };
    }
  }
}

export const settingsService = new HybridSettingsService();
