import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { GeofenceSettings } from '../types';

export const DEFAULT_GEOFENCE_SETTINGS: GeofenceSettings = {
  enabled: true,
  centerLatitude: 24.4267,
  centerLongitude: 54.6511,
  loginRadiusMeters: 200,
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
            const cleanMerged: GeofenceSettings = {
              enabled: merged.enabled !== false,
              centerLatitude: Number(merged.centerLatitude) || DEFAULT_GEOFENCE_SETTINGS.centerLatitude,
              centerLongitude: Number(merged.centerLongitude) || DEFAULT_GEOFENCE_SETTINGS.centerLongitude,
              loginRadiusMeters: Number(merged.loginRadiusMeters) || DEFAULT_GEOFENCE_SETTINGS.loginRadiusMeters,
              signOutRadiusMeters: Number(merged.signOutRadiusMeters) || DEFAULT_GEOFENCE_SETTINGS.signOutRadiusMeters,
            };
            // Sync to Dexie locally
            const local = await db.settings.where('key').equals('geofence_settings').first();
            if (local && local.id) {
              await db.settings.update(local.id, { value: cleanMerged });
            } else {
              await db.settings.add({ key: 'geofence_settings', value: cleanMerged });
            }
            return cleanMerged;
          } catch (e) {
            console.warn('Failed to parse geofence JSON from users table:', e);
          }
        }
      }

      // Dexie fallback
      const local = await db.settings.where('key').equals('geofence_settings').first();
      if (local && local.value) {
        const merged = { ...DEFAULT_GEOFENCE_SETTINGS, ...local.value };
        return {
          enabled: merged.enabled !== false,
          centerLatitude: Number(merged.centerLatitude) || DEFAULT_GEOFENCE_SETTINGS.centerLatitude,
          centerLongitude: Number(merged.centerLongitude) || DEFAULT_GEOFENCE_SETTINGS.centerLongitude,
          loginRadiusMeters: Number(merged.loginRadiusMeters) || DEFAULT_GEOFENCE_SETTINGS.loginRadiusMeters,
          signOutRadiusMeters: Number(merged.signOutRadiusMeters) || DEFAULT_GEOFENCE_SETTINGS.signOutRadiusMeters,
        };
      }
    } catch (err) {
      console.warn('Failed to load geofence settings, using defaults:', err);
    }
    return DEFAULT_GEOFENCE_SETTINGS;
  }

  async saveGeofenceSettings(settings: GeofenceSettings): Promise<{ success: boolean; error?: string }> {
    try {
      const cleanSettings: GeofenceSettings = {
        enabled: Boolean(settings.enabled),
        centerLatitude: Number(settings.centerLatitude) || 24.4267,
        centerLongitude: Number(settings.centerLongitude) || 54.6511,
        loginRadiusMeters: Number(settings.loginRadiusMeters) || 200,
        signOutRadiusMeters: Number(settings.signOutRadiusMeters) || 500,
      };

      // Save locally to Dexie
      const local = await db.settings.where('key').equals('geofence_settings').first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: cleanSettings });
      } else {
        await db.settings.add({ key: 'geofence_settings', value: cleanSettings });
      }

      // Save to Supabase central cloud via users table
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').upsert(
          {
            username: GEOFENCE_SETTING_KEY,
            password_hash: JSON.stringify(cleanSettings),
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
