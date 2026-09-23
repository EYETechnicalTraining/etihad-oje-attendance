import { traineeService as dexieTrainee } from './dexie/traineeService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Trainee, Batch, Remark } from '../types';
import { db } from '../db';
import { hashPassword } from '../utils/security';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { ITraineeService } from './api';

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

  async addRemark(traineeId: string, remarkText: string, author: string): Promise<{ success: boolean; remark?: Remark; error?: string }> {
    const cleanRemark = remarkText.trim();
    if (!cleanRemark) return { success: false, error: 'Remark cannot be empty' };

    if (!isSupabaseConfigured || !supabase) return await dexieTrainee.addRemark(traineeId, cleanRemark, author);

    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const { data, error } = await supabase.from('remarks').insert([{
        trainee_id: traineeId,
        remark: cleanRemark,
        created_by: author,
        date,
        time,
        timestamp,
      }]).select();

      if (error || !data || data.length === 0) {
        return { success: false, error: error?.message || 'Failed to save remark.' };
      }

      const newRemark: Remark = {
        id: data[0].id,
        traineeId,
        remark: cleanRemark,
        createdBy: author,
        date,
        time,
        timestamp,
      };

      // Mirror into Dexie with the exact same ID
      try {
        await db.remarks.put(newRemark);
      } catch {
        // ignore
      }

      return {
        success: true,
        remark: newRemark,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save remark' };
    }
  }

  async deleteRemark(remarkId: number): Promise<{ success: boolean; error?: string }> {
    let success = true;
    let errorMsg = '';

    // 1. Delete in Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('remarks').delete().eq('id', remarkId);
        if (error) {
          console.error('Failed to delete remark from Supabase:', error);
          success = false;
          errorMsg = error.message;
        }
      } catch (err: any) {
        console.error('Failed to delete remark from Supabase:', err);
        success = false;
        errorMsg = err.message;
      }
    }

    // 2. Delete in Dexie
    try {
      await db.remarks.delete(remarkId);
    } catch (err) {
      console.warn('Failed to delete remark from Dexie:', err);
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
