import { auditService as dexieAudit } from './dexie/auditService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { AuditLog } from '../types';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { IAuditService } from './api';

export class HybridAuditService implements IAuditService {
  async logAction(user: string, action: string, relatedTrainee?: string): Promise<void> {
    if (!isSupabaseConfigured || !supabase) {
      await dexieAudit.logAction(user, action, relatedTrainee);
      return;
    }

    try {
      await supabase.from('audit_logs').insert([{
        user_name: user,
        action,
        date: getUAEDateString(),
        time: getUAETimeString(),
        related_trainee: relatedTrainee || null,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      console.error('Failed to write audit log to Supabase:', err);
    }
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieAudit.getAuditLogs();

    const { data } = await supabase.from('audit_logs').select('*').order('timestamp', { ascending: false });
    if (!data) return [];
    return data.map((a: any) => ({
      id: a.id,
      user: a.user_name,
      action: a.action,
      date: a.date,
      time: a.time,
      relatedTrainee: a.related_trainee,
      timestamp: Number(a.timestamp),
    }));
  }
}

export const auditService = new HybridAuditService();
