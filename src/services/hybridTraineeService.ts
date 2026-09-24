import { traineeService as dexieTrainee } from './dexie/traineeService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Trainee, Batch, Remark, RemarkHistoryItem } from '../types';
import { db } from '../db';
import { hashPassword } from '../utils/security';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { ITraineeService } from './api';
import { auditService } from './hybridAuditService';

const REMARKS_HISTORY_KEY = '__SYSTEM_REMARKS_HISTORY__';

export class HybridTraineeService implements ITraineeService {
  async getAllTrainees(): Promise<Trainee[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.getAllTrainees();

    const { data, error } = await supabase.from('trainees').select('*');
    if (error || !data) return [];
    return data.map((t: any) => ({
      id: t.id,
      traineeId: t.trainee_id,
      name: t.name,
      email: t.email,
      batchId: t.batch_id,
      program: t.program,
      active: t.active,
      createdAt: t.created_at,
      enrollmentSelfie: t.enrollment_selfie,
    }));
  }

  async getTraineeById(traineeId: string): Promise<Trainee | null> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.getTraineeById(traineeId);

    const { data } = await supabase.from('trainees').select('*').eq('trainee_id', traineeId);
    if (!data || data.length === 0) return null;
    const t = data[0];
    return {
      id: t.id,
      traineeId: t.trainee_id,
      name: t.name,
      email: t.email,
      batchId: t.batch_id,
      program: t.program,
      active: t.active,
      createdAt: t.created_at,
      enrollmentSelfie: t.enrollment_selfie,
    };
  }

  async addTrainee(traineeData: Omit<Trainee, 'id' | 'createdAt'>): Promise<{ success: boolean; trainee?: Trainee; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.addTrainee(traineeData);

    try {
      const cleanTraineeId = traineeData.traineeId.trim();
      const cleanEmail = traineeData.email.trim().toLowerCase();
      const createdAt = getUAEDateString();

      const { data: existingId } = await supabase.from('trainees').select('*').eq('trainee_id', cleanTraineeId);
      if (existingId && existingId.length > 0) return { success: false, error: `Trainee ID "${cleanTraineeId}" already exists.` };

      const { data: newT, error } = await supabase
        .from('trainees')
        .insert([{
          trainee_id: cleanTraineeId,
          name: traineeData.name,
          email: cleanEmail,
          batch_id: traineeData.batchId,
          program: traineeData.program,
          active: true,
          created_at: createdAt,
        }])
        .select();

      if (error || !newT) return { success: false, error: error?.message || 'Failed to insert trainee.' };

      // Auto create login
      const defaultPassword = `Etihad@${cleanTraineeId}`;
      const passwordHash = await hashPassword(defaultPassword);

      await supabase.from('users').insert([{
        username: cleanEmail,
        password_hash: passwordHash,
        role: 'TRAINEE',
        trainee_id: cleanTraineeId,
        active: true,
        force_password_change: true,
        last_login: null,
        last_password_change: null,
      }]);

      // Sync Dexie locally
      await dexieTrainee.addTrainee(traineeData);

      return {
        success: true,
        trainee: {
          id: newT[0].id,
          traineeId: cleanTraineeId,
          name: traineeData.name,
          email: cleanEmail,
          batchId: traineeData.batchId,
          program: traineeData.program,
          active: true,
          createdAt,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add trainee' };
    }
  }

  async removeTrainee(traineeId: string): Promise<{ success: boolean; error?: string }> {
    // Sync Dexie locally
    await dexieTrainee.removeTrainee(traineeId);

    if (!isSupabaseConfigured || !supabase) return { success: true };

    try {
      await supabase.from('trainees').delete().eq('trainee_id', traineeId);
      await supabase.from('users').delete().eq('trainee_id', traineeId);
      await supabase.from('passkey_credentials').delete().eq('trainee_id', traineeId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to remove trainee' };
    }
  }

  async getBatches(): Promise<Batch[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.getBatches();

    const { data } = await supabase.from('batches').select('*');
    if (!data) return await dexieTrainee.getBatches();
    return data.map((b: any) => ({ id: b.id, name: b.name, createdAt: b.created_at }));
  }

  async addBatch(name: string): Promise<{ success: boolean; batch?: Batch; error?: string }> {
    const cleanName = name.trim();
    // Sync Dexie locally
    await dexieTrainee.addBatch(cleanName);

    if (!isSupabaseConfigured || !supabase) {
      const batches = await dexieTrainee.getBatches();
      const b = batches.find((x) => x.name.toLowerCase() === cleanName.toLowerCase());
      return { success: true, batch: b };
    }

    try {
      const createdAt = getUAEDateString();
      const { data, error } = await supabase.from('batches').insert([{ name: cleanName, created_at: createdAt }]).select();
      if (error || !data) return { success: false, error: error?.message || 'Failed to add batch.' };
      return { success: true, batch: { id: data[0].id, name: cleanName, createdAt } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add batch' };
    }
  }

  async deleteBatch(batchId: number): Promise<{ success: boolean; error?: string }> {
    // Sync Dexie locally
    await dexieTrainee.deleteBatch(batchId);

    if (!isSupabaseConfigured || !supabase) return { success: true };

    try {
      await supabase.from('batches').delete().eq('id', batchId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete batch' };
    }
  }

  async getRemarks(traineeId: string): Promise<Remark[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.getRemarks(traineeId);

    try {
      const { data, error } = await supabase
        .from('remarks')
        .select('*')
        .eq('trainee_id', traineeId)
        .order('timestamp', { ascending: false });

      if (error || !data) {
        console.warn('Supabase getRemarks query error, falling back to local storage:', error?.message);
        return await dexieTrainee.getRemarks(traineeId);
      }

      // Sync Dexie with fresh Supabase remarks for this trainee so deleted remarks are purged
      try {
        await db.remarks.where('traineeId').equals(traineeId).delete();
        if (data.length > 0) {
          const records: Remark[] = data.map((r: any) => ({
            id: r.id,
            traineeId: r.trainee_id,
            remark: r.remark,
            createdBy: r.created_by,
            date: r.date,
            time: r.time,
            timestamp: Number(r.timestamp),
          }));
          await db.remarks.bulkPut(records);
        }
      } catch {
        // ignore local cache sync issues
      }

      return data.map((r: any) => ({
        id: r.id,
        traineeId: r.trainee_id,
        remark: r.remark,
        createdBy: r.created_by,
        date: r.date,
        time: r.time,
        timestamp: Number(r.timestamp),
      }));
    } catch (err: any) {
      console.warn('Failed to fetch remarks from Supabase, using local database:', err);
      return await dexieTrainee.getRemarks(traineeId);
    }
  }

  async getRemarksHistory(traineeId?: string): Promise<RemarkHistoryItem[]> {
    let list: RemarkHistoryItem[] = [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data } = await supabase
          .from('users')
          .select('password_hash')
          .eq('username', REMARKS_HISTORY_KEY)
          .maybeSingle();

        if (data && data.password_hash) {
          list = JSON.parse(data.password_hash);
          // Sync to Dexie local cache
          const local = await db.settings.where('key').equals('remarks_history').first();
          if (local && local.id) {
            await db.settings.update(local.id, { value: list });
          } else {
            await db.settings.add({ key: 'remarks_history', value: list });
          }
        }
      } catch (err) {
        console.warn('Failed to fetch remarks_history from Supabase, checking local:', err);
      }
    }

    if (list.length === 0) {
      const local = await db.settings.where('key').equals('remarks_history').first();
      if (local && Array.isArray(local.value)) {
        list = local.value;
      }
    }

    if (!traineeId) return list;
    const norm = traineeId.trim().toUpperCase();
    return list.filter((h) => h.traineeId && h.traineeId.trim().toUpperCase() === norm);
  }

  private async saveRemarksHistoryList(list: RemarkHistoryItem[]): Promise<void> {
    // 1. Save locally to Dexie
    try {
      const local = await db.settings.where('key').equals('remarks_history').first();
      if (local && local.id) {
        await db.settings.update(local.id, { value: list });
      } else {
        await db.settings.add({ key: 'remarks_history', value: list });
      }
    } catch (e) {
      console.warn('Failed to save remarks_history in Dexie:', e);
    }

    // 2. Save centrally to Supabase users table
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('users').upsert(
          {
            username: REMARKS_HISTORY_KEY,
            password_hash: JSON.stringify(list),
            role: 'MASTER',
            active: true,
          },
          { onConflict: 'username' }
        );
      } catch (e) {
        console.warn('Failed to save remarks_history in Supabase:', e);
      }
    }
  }

  async addRemark(traineeId: string, remarkText: string, author: string): Promise<{ success: boolean; remark?: Remark; error?: string }> {
    const cleanRemark = remarkText.trim();
    if (!cleanRemark) return { success: false, error: 'Remark cannot be empty' };

    const date = getUAEDateString();
    const time = getUAETimeString();
    const timestamp = Date.now();

    // 1. Save into Dexie local database for instantaneous UI feedback
    let localId: number | undefined;
    try {
      localId = await db.remarks.add({
        traineeId,
        remark: cleanRemark,
        createdBy: author,
        date,
        time,
        timestamp,
      });
    } catch {
      // ignore
    }

    let supabaseId: number | undefined;

    // 2. Save into Supabase active remarks table
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase.from('remarks').insert([{
          trainee_id: traineeId,
          remark: cleanRemark,
          created_by: author,
          date,
          time,
          timestamp,
        }]).select();

        if (data && data.length > 0) {
          supabaseId = data[0].id;
          if (localId && localId !== supabaseId) {
            try {
              await db.remarks.delete(localId);
              await db.remarks.put({
                id: supabaseId,
                traineeId,
                remark: cleanRemark,
                createdBy: author,
                date,
                time,
                timestamp,
              });
            } catch {
              // ignore
            }
          }
        }
      } catch (err: any) {
        console.warn('Supabase remark insert error, kept in local storage:', err);
      }
    }

    const finalId = supabaseId || localId || timestamp;

    // 3. Save into Remarks History (permanent historical ledger)
    try {
      const historyList = await this.getRemarksHistory();
      const historyItem: RemarkHistoryItem = {
        id: finalId,
        traineeId,
        remark: cleanRemark,
        createdBy: author,
        date,
        time,
        timestamp,
        status: 'active',
      };
      historyList.unshift(historyItem);
      await this.saveRemarksHistoryList(historyList);
    } catch (hErr) {
      console.warn('Failed to update remarks history on add:', hErr);
    }

    // 4. Log to central audit trail
    try {
      await auditService.logAction(
        author,
        `Added Remark for Trainee ${traineeId}: "${cleanRemark}"`,
        traineeId
      );
    } catch {
      // non-blocking
    }

    return {
      success: true,
      remark: {
        id: finalId,
        traineeId,
        remark: cleanRemark,
        createdBy: author,
        date,
        time,
        timestamp,
      },
    };
  }

  async deleteRemark(remarkId: number, traineeId?: string, remarkText?: string, deleter?: string): Promise<{ success: boolean; error?: string }> {
    let success = true;
    let errorMsg = '';
    const effectiveDeleter = deleter || 'selva.master';

    // 1. Delete from Dexie active table
    try {
      await dexieTrainee.deleteRemark(remarkId, traineeId, remarkText, effectiveDeleter);
    } catch (err) {
      console.warn('Failed to delete remark from Dexie:', err);
    }

    // 2. Delete from Supabase active table
    if (isSupabaseConfigured && supabase) {
      try {
        if (remarkId > 0) {
          const { error: idError } = await supabase.from('remarks').delete().eq('id', remarkId);
          if (idError) {
            console.error('Failed to delete remark from Supabase by ID:', idError);
          }
        }

        if (traineeId && remarkText) {
          const cleanText = remarkText.trim();
          const { error: dupError } = await supabase
            .from('remarks')
            .delete()
            .eq('trainee_id', traineeId)
            .eq('remark', cleanText);
          if (dupError) {
            console.warn('Failed to delete duplicate remarks from Supabase by text:', dupError);
          }
        }
      } catch (err: any) {
        console.error('Failed to delete remark from Supabase:', err);
        success = false;
        errorMsg = err.message;
      }
    }

    // 3. Mark as deleted in Remarks History so the history is permanently preserved
    try {
      const historyList = await this.getRemarksHistory();
      let found = false;
      const updated = historyList.map((h) => {
        const matchesId = remarkId > 0 && h.id === remarkId;
        const matchesText = traineeId && remarkText &&
          h.traineeId.trim().toUpperCase() === traineeId.trim().toUpperCase() &&
          h.remark.trim() === remarkText.trim() &&
          h.status === 'active';

        if (matchesId || matchesText) {
          found = true;
          return {
            ...h,
            status: 'deleted' as const,
            deletedBy: effectiveDeleter,
            deletedAtDate: getUAEDateString(),
            deletedAtTime: getUAETimeString(),
            deletedTimestamp: Date.now(),
          };
        }
        return h;
      });

      if (!found && traineeId && remarkText) {
        updated.unshift({
          id: remarkId || Date.now(),
          traineeId,
          remark: remarkText.trim(),
          createdBy: 'Supervisor',
          date: getUAEDateString(),
          time: getUAETimeString(),
          timestamp: Date.now(),
          status: 'deleted',
          deletedBy: effectiveDeleter,
          deletedAtDate: getUAEDateString(),
          deletedAtTime: getUAETimeString(),
          deletedTimestamp: Date.now(),
        });
      }

      await this.saveRemarksHistoryList(updated);
    } catch (hErr) {
      console.warn('Failed to mark remark deleted in history:', hErr);
    }

    // 4. Record audit log
    if (traineeId) {
      try {
        await auditService.logAction(
          effectiveDeleter,
          `Deleted Remark for Trainee ${traineeId}: "${remarkText || `ID #${remarkId}`}"`,
          traineeId
        );
      } catch {
        // non-blocking
      }
    }

    return { success, error: errorMsg };
  }

  async saveEnrollmentSelfie(traineeId: string, selfieBase64: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.saveEnrollmentSelfie(traineeId, selfieBase64);

    try {
      await supabase.from('trainees').update({ enrollment_selfie: selfieBase64 }).eq('trainee_id', traineeId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save enrollment selfie' };
    }
  }
}

export const traineeService = new HybridTraineeService();
