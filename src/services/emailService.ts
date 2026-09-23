import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { TraineeLogSummary } from '../types';
import { isPastCutoffTime, getUAEDateString } from '../utils/timezone';

export interface EmailSettings {
  autoEmailEnabled: boolean;
  senderOutlookEmail: string;       // Supervisor's Outlook Email Address
  powerAutomateWebhookUrl: string;  // Power Automate HTTP Webhook URL
  lastNoShowNotificationDate: string; // YYYY-MM-DD
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  autoEmailEnabled: true,
  senderOutlookEmail: 'supervisor@etihad.ae',
  powerAutomateWebhookUrl: '',
  lastNoShowNotificationDate: '',
};

const EMAIL_SETTING_KEY = '__SYSTEM_EMAIL_SETTINGS__';

export class EmailService {
  async getEmailSettings(): Promise<EmailSettings> {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('username', EMAIL_SETTING_KEY)
          .maybeSingle();

        if (data && data.password_hash) {
          try {
            const parsed = JSON.parse(data.password_hash);
            const merged = { ...DEFAULT_EMAIL_SETTINGS, ...parsed };
            // Sync to local Dexie
            const local = await db.settings.where('key').equals('email_settings').first();
            if (local && local.id) {
              await db.settings.update(local.id, { value: merged });
            } else {
              await db.settings.add({ key: 'email_settings', value: merged });
            }
            return merged;
          } catch (e) {
            console.warn('Failed to parse email settings JSON:', e);
          }
        }
      }

      const local = await db.settings.where('key').equals('email_settings').first();
      if (local && local.value) {
        return { ...DEFAULT_EMAIL_SETTINGS, ...local.value };
      }
    } catch (err) {
      console.warn('Failed to load email settings, using defaults:', err);
    }
    return DEFAULT_EMAIL_SETTINGS;
  }

  async saveEmailSettings(settings: EmailSettings): Promise<{ success: boolean; error?: string }> {
    try {
      const local = await db.settings.where('key').equals('email_settings').first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: settings });
      } else {
        await db.settings.add({ key: 'email_settings', value: settings });
      }

      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase.from('users').upsert(
          {
            username: EMAIL_SETTING_KEY,
            password_hash: JSON.stringify(settings),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );

        if (error) {
          return { success: false, error: error.message };
        }
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save email settings.' };
    }
  }

  /**
   * Dispatch single email notification via Microsoft Power Automate HTTP Webhook
   */
  async sendSingleEmail(
    toName: string,
    toEmail: string,
    dateStr: string,
    settings: EmailSettings
  ): Promise<{ success: boolean; error?: string }> {
    if (!settings.powerAutomateWebhookUrl) {
      return {
        success: false,
        error: 'Power Automate Webhook URL not configured. Please paste your Power Automate HTTP URL in Admin Settings.',
      };
    }

    try {
      const response = await fetch(settings.powerAutomateWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_name: toName,
          to_email: toEmail,
          from_email: settings.senderOutlookEmail,
          date: dateStr,
          subject: `[Notice] Marked as No Show - Etihad Engineering OJE Training`,
          message: `Dear ${toName},\n\nYou have not logged your attendance before the 08:00 AM UAE cutoff time for today (${dateStr}). As per Etihad Engineering OJE training regulations, your status for today has been recorded as NO SHOW.\n\nRegards,\nEtihad Engineering Technical Training`,
        }),
      });

      if (response.ok || response.status === 202 || response.status === 200) {
        return { success: true };
      } else {
        const text = await response.text();
        return { success: false, error: text || `Power Automate HTTP error ${response.status}` };
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to trigger Power Automate flow.' };
    }
  }

  /**
   * Automated check triggered after 08:00 AM.
   * Triggers Power Automate flow to send automated No Show Outlook emails to all unlogged trainees.
   */
  async triggerAutomatedNoShowEmails(
    targetDate: string,
    logs: TraineeLogSummary[]
  ): Promise<{ dispatchedCount: number; errors: string[] }> {
    const settings = await this.getEmailSettings();
    const errors: string[] = [];
    let count = 0;

    if (!settings.autoEmailEnabled) return { dispatchedCount: 0, errors: [] };
    if (!isPastCutoffTime(targetDate)) return { dispatchedCount: 0, errors: [] };
    if (settings.lastNoShowNotificationDate === targetDate) return { dispatchedCount: 0, errors: [] };

    const noShowTrainees = logs.filter((l) => l.status === 'No Show' && l.username);

    for (const trainee of noShowTrainees) {
      const res = await this.sendSingleEmail(trainee.name, trainee.username, targetDate, settings);
      if (res.success) {
        count++;
      } else if (res.error) {
        errors.push(`${trainee.name} (${trainee.username}): ${res.error}`);
      }
    }

    if (count > 0 || noShowTrainees.length > 0) {
      settings.lastNoShowNotificationDate = targetDate;
      await this.saveEmailSettings(settings);
    }

    return { dispatchedCount: count, errors };
  }
}

export const emailService = new EmailService();
