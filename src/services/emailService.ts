import { db } from '../db';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { TraineeLogSummary } from '../types';
import { isPastCutoffTime, isWeekend, getUAEDateString, formatDisplayDate, getUAETimeString } from '../utils/timezone';
import { holidayService } from './hybridHolidayService';

export interface EmailSettings {
  autoEmailEnabled: boolean;
  autoLateEmailEnabled?: boolean;
  senderOutlookEmail: string;       // Supervisor's Outlook Email Address
  powerAutomateWebhookUrl: string;  // Power Automate HTTP Webhook URL
  lastNoShowNotificationDate: string; // YYYY-MM-DD
  sentEmailHistory?: Record<string, string[]>; // { [dateStr]: ["email_status", ...] }
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  autoEmailEnabled: true,
  autoLateEmailEnabled: true,
  senderOutlookEmail: 'supervisor@etihad.ae',
  powerAutomateWebhookUrl: '',
  lastNoShowNotificationDate: '',
  sentEmailHistory: {},
};

const EMAIL_SETTING_KEY = '__SYSTEM_EMAIL_SETTINGS__';

/**
 * Generates executive corporate HTML email template compatible with Microsoft Outlook & mobile clients
 */
export function generateAttendanceEmailHtml(options: {
  toName: string;
  dateStr: string;
  status: 'No Show' | 'Late to Work';
  loginTime?: string;
  traineeId?: string;
}): string {
  const { toName, dateStr, status, loginTime, traineeId } = options;
  const isNoShow = status === 'No Show';
  const displayDate = formatDisplayDate(dateStr, true) || dateStr;

  const statusBg = isNoShow ? '#FEF2F2' : '#FFFBEB';
  const statusBorder = isNoShow ? '#F87171' : '#FBBF24';
  const statusColor = isNoShow ? '#991B1B' : '#92400E';
  const statusIcon = isNoShow ? '⚠️' : '⏰';
  const statusText = isNoShow ? 'NO SHOW' : 'LATE TO WORK';
  const cutoffText = isNoShow ? '08:00 AM UAE (No-Show Cutoff)' : '07:30 AM UAE (Morning Arrival Cutoff)';
  const timeRecordedText = isNoShow ? 'Not Recorded (Absent at Cutoff)' : (loginTime || 'Past 07:30 AM');

  const explanation = isNoShow
    ? `This is an official automated notification to inform you that you have <strong>not logged your attendance</strong> before the <strong>08:00 AM UAE cutoff time</strong> for today. As per Etihad Engineering OJE Training regulations, your attendance record for today has been registered as <strong style="color: #991B1B;">NO SHOW</strong>.`
    : `This is an official automated notification to inform you that your attendance was logged at <strong>${loginTime || 'past 07:30 AM'}</strong>, which is past the official <strong>07:30 AM UAE morning arrival cutoff</strong>. As per Etihad Engineering OJE Training regulations, your attendance record for today has been registered as <strong style="color: #92400E;">LATE TO WORK</strong>.`;

  return `
<div style="background-color: #f1f5f9; padding: 25px 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; border-top: 5px solid #C5A059;">
    <!-- HEADER -->
    <tr>
      <td style="background-color: #0A192F; padding: 22px 24px; text-align: center;">
        <div style="color: #C5A059; font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px;">
          ETIHAD ENGINEERING &bull; TECHNICAL TRAINING
        </div>
        <div style="color: #ffffff; font-size: 19px; font-weight: 700; letter-spacing: 0.5px; margin: 0;">
          On-the-Job Experience (OJE) Attendance Notice
        </div>
      </td>
    </tr>

    <!-- STATUS ALERT CALLOUT -->
    <tr>
      <td style="padding: 24px 28px 10px 28px;">
        <div style="background-color: ${statusBg}; border: 1.5px solid ${statusBorder}; border-radius: 6px; padding: 12px 18px; text-align: center;">
          <span style="color: ${statusColor}; font-size: 15px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;">
            ${statusIcon} ATTENDANCE STATUS: ${statusText}
          </span>
        </div>
      </td>
    </tr>

    <!-- MAIN BODY CONTENT -->
    <tr>
      <td style="padding: 15px 28px 20px 28px; line-height: 1.6; font-size: 14px; color: #334155;">
        <p style="margin: 0 0 16px 0; font-size: 15px; color: #0A192F;">
          Dear <strong>${toName}</strong>,
        </p>

        <p style="margin: 0 0 18px 0; line-height: 1.6;">
          ${explanation}
        </p>

        <!-- RECORD DETAILS TABLE -->
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 18px 0; font-size: 13.5px; border-collapse: collapse;">
          ${traineeId ? `
          <tr>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; width: 40%;">Trainee Staff ID</td>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #0A192F; font-weight: 700;">${traineeId}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600; width: 40%;">Trainee Name</td>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #0A192F; font-weight: 700;">${toName}</td>
          </tr>
          <tr>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Date</td>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #0A192F; font-weight: 700;">${displayDate}</td>
          </tr>
          <tr>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Recorded Status</td>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: ${statusColor}; font-weight: 800;">${statusText}</td>
          </tr>
          <tr>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-weight: 600;">Recorded Timestamp</td>
            <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #0A192F; font-weight: 700;">${timeRecordedText}</td>
          </tr>
          <tr>
            <td style="padding: 9px 14px; color: #64748b; font-weight: 600;">Regulation Policy Cutoff</td>
            <td style="padding: 9px 14px; color: #0A192F; font-weight: 700;">${cutoffText}</td>
          </tr>
        </table>

        <!-- REGULATORY NOTICE CALLOUT -->
        <div style="margin: 18px 0 0 0; background-color: #FEF9C3; border-left: 4px solid #EAB308; padding: 10px 14px; border-radius: 4px; font-size: 12.5px; color: #713F12; line-height: 1.5;">
          <strong>Important Notice:</strong> All attendance logs are formally audited as part of your GCAA / EASA Part-66 aircraft maintenance practical logbook compliance. If you believe this record was made in error or you have prior authorized leave, please contact your OJE Training Coordinator immediately.
        </div>
      </td>
    </tr>

    <!-- FOOTER SIGNATURE -->
    <tr>
      <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; font-size: 13px; color: #64748b;">
        <div style="font-weight: 700; color: #0A192F; font-size: 13.5px;">
          Etihad Engineering Technical Training Department
        </div>
        <div style="color: #C5A059; font-weight: 600; font-size: 12px; margin-top: 2px;">
          On-the-Job Experience (OJE) Training Management
        </div>
        <div style="color: #94a3b8; font-size: 11px; margin-top: 6px;">
          This is an automated communication generated by the Etihad OJE Attendance Management System. Please do not reply directly to this automated email.
        </div>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

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
   * Helper to dispatch an email via Microsoft Power Automate HTTP Webhook
   */
  private async dispatchViaWebhook(payload: {
    toName: string;
    toEmail: string;
    fromEmail: string;
    dateStr: string;
    status: 'No Show' | 'Late to Work';
    subject: string;
    htmlContent: string;
    webhookUrl: string;
  }): Promise<{ success: boolean; error?: string }> {
    if (!payload.webhookUrl) {
      return {
        success: false,
        error: 'Power Automate Webhook URL not configured. Please paste your Power Automate HTTP URL in Admin Settings.',
      };
    }

    try {
      const response = await fetch(payload.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_name: payload.toName,
          to_email: payload.toEmail,
          from_email: payload.fromEmail,
          date: payload.dateStr,
          status: payload.status,
          subject: payload.subject,
          message: payload.htmlContent, // Outlook Send an email (V2) renders this as HTML
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
   * Send No Show email to a trainee
   */
  async sendNoShowEmail(
    toName: string,
    toEmail: string,
    dateStr: string,
    traineeId?: string,
    customSettings?: EmailSettings
  ): Promise<{ success: boolean; error?: string }> {
    if (isWeekend(dateStr)) return { success: false, error: 'Email blocked on weekend.' };
    const holidays = await holidayService.getAllHolidays();
    if (holidays.some((h) => h.date === dateStr)) return { success: false, error: 'Email blocked on holiday.' };

    const settings = customSettings || (await this.getEmailSettings());
    if (!settings.autoEmailEnabled) return { success: false, error: 'Automated email dispatch is disabled in settings.' };

    // Prevent duplicate dispatch for this trainee today
    const key = `${toEmail}_No Show`;
    if (settings.sentEmailHistory?.[dateStr]?.includes(key)) {
      return { success: true };
    }

    const htmlContent = generateAttendanceEmailHtml({
      toName,
      dateStr,
      status: 'No Show',
      traineeId,
    });

    const res = await this.dispatchViaWebhook({
      toName,
      toEmail,
      fromEmail: settings.senderOutlookEmail,
      dateStr,
      status: 'No Show',
      subject: `[Notice] Attendance Status: NO SHOW - Etihad Engineering OJE Training`,
      htmlContent,
      webhookUrl: settings.powerAutomateWebhookUrl,
    });

    if (res.success) {
      // Record sent history
      if (!settings.sentEmailHistory) settings.sentEmailHistory = {};
      if (!settings.sentEmailHistory[dateStr]) settings.sentEmailHistory[dateStr] = [];
      if (!settings.sentEmailHistory[dateStr].includes(key)) {
        settings.sentEmailHistory[dateStr].push(key);
        await this.saveEmailSettings(settings);
      }

      // Record audit log
      try {
        await db.auditLogs.add({
          user: 'SYSTEM',
          action: `Automated NO SHOW email sent to ${toName} (${toEmail})`,
          date: dateStr,
          time: getUAETimeString(),
          relatedTrainee: traineeId || toEmail,
          timestamp: Date.now(),
        });
      } catch (e) {
        // silent fail for audit log
      }
    }

    return res;
  }

  /**
   * Send Late to Work email to a trainee
   */
  async sendLateToWorkEmail(
    toName: string,
    toEmail: string,
    dateStr: string,
    loginTime: string,
    traineeId?: string,
    customSettings?: EmailSettings
  ): Promise<{ success: boolean; error?: string }> {
    if (isWeekend(dateStr)) return { success: false, error: 'Email blocked on weekend.' };
    const holidays = await holidayService.getAllHolidays();
    if (holidays.some((h) => h.date === dateStr)) return { success: false, error: 'Email blocked on holiday.' };

    const settings = customSettings || (await this.getEmailSettings());
    if (settings.autoLateEmailEnabled === false) return { success: false, error: 'Late email dispatch disabled.' };

    // Prevent duplicate dispatch for this trainee today
    const key = `${toEmail}_Late to Work`;
    if (settings.sentEmailHistory?.[dateStr]?.includes(key)) {
      return { success: true };
    }

    const htmlContent = generateAttendanceEmailHtml({
      toName,
      dateStr,
      status: 'Late to Work',
      loginTime,
      traineeId,
    });

    const res = await this.dispatchViaWebhook({
      toName,
      toEmail,
      fromEmail: settings.senderOutlookEmail,
      dateStr,
      status: 'Late to Work',
      subject: `[Notice] Attendance Status: LATE TO WORK - Etihad Engineering OJE Training`,
      htmlContent,
      webhookUrl: settings.powerAutomateWebhookUrl,
    });

    if (res.success) {
      if (!settings.sentEmailHistory) settings.sentEmailHistory = {};
      if (!settings.sentEmailHistory[dateStr]) settings.sentEmailHistory[dateStr] = [];
      if (!settings.sentEmailHistory[dateStr].includes(key)) {
        settings.sentEmailHistory[dateStr].push(key);
        await this.saveEmailSettings(settings);
      }

      try {
        await db.auditLogs.add({
          user: 'SYSTEM',
          action: `Automated LATE TO WORK email sent to ${toName} (${toEmail})`,
          date: dateStr,
          time: getUAETimeString(),
          relatedTrainee: traineeId || toEmail,
          timestamp: Date.now(),
        });
      } catch (e) {
        // silent fail for audit log
      }
    }

    return res;
  }

  /**
   * Backward-compatible method for single email (No Show)
   */
  async sendSingleEmail(
    toName: string,
    toEmail: string,
    dateStr: string,
    settings: EmailSettings
  ): Promise<{ success: boolean; error?: string }> {
    return this.sendNoShowEmail(toName, toEmail, dateStr, undefined, settings);
  }

  /**
   * Automated check triggered after 08:00 AM.
   * Dispatches No-Show emails to all unlogged trainees.
   */
  async triggerAutomatedNoShowEmails(
    targetDate: string,
    logs: TraineeLogSummary[]
  ): Promise<{ dispatchedCount: number; errors: string[] }> {
    const settings = await this.getEmailSettings();
    const errors: string[] = [];
    let count = 0;

    if (!settings.autoEmailEnabled) return { dispatchedCount: 0, errors: [] };
    if (isWeekend(targetDate)) return { dispatchedCount: 0, errors: [] }; // No emails on weekends
    const holidays = await holidayService.getAllHolidays();
    if (holidays.some((h) => h.date === targetDate)) return { dispatchedCount: 0, errors: [] }; // No emails on holidays

    if (!isPastCutoffTime(targetDate)) return { dispatchedCount: 0, errors: [] };
    if (settings.lastNoShowNotificationDate === targetDate) return { dispatchedCount: 0, errors: [] };

    const noShowTrainees = logs.filter((l) => l.status === 'No Show' && l.username);

    for (const trainee of noShowTrainees) {
      const res = await this.sendNoShowEmail(trainee.name, trainee.username, targetDate, trainee.traineeId, settings);
      if (res.success) {
        count++;
      } else if (res.error && !res.error.includes('blocked')) {
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
