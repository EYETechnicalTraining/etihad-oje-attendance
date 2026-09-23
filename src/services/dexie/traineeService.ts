import { db } from '../../db';
import { Trainee, Batch, Remark } from '../../types';
import { hashPassword } from '../../utils/security';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { ITraineeService } from '../api';

export class DexieTraineeService implements ITraineeService {
  async getAllTrainees(): Promise<Trainee[]> {
    return await db.trainees.toArray();
  }

  async getTraineeById(traineeId: string): Promise<Trainee | null> {
    const trainee = await db.trainees.where('traineeId').equals(traineeId).first();
    return trainee || null;
  }

  async addTrainee(traineeData: Omit<Trainee, 'id' | 'createdAt'>): Promise<{ success: boolean; trainee?: Trainee; error?: string }> {
    try {
      const cleanTraineeId = traineeData.traineeId.trim();
      const cleanEmail = traineeData.email.trim().toLowerCase();

      // Check unique Trainee ID
      const existingId = await db.trainees.where('traineeId').equals(cleanTraineeId).first();
      if (existingId) {
        return { success: false, error: `Trainee ID "${cleanTraineeId}" already exists.` };
      }

      // Check unique Email
      const existingEmail = await db.trainees.where('email').equals(cleanEmail).first();
      if (existingEmail) {
        return { success: false, error: `Trainee Email "${cleanEmail}" is already registered.` };
      }

      const createdAt = getUAEDateString();
      const newTrainee: Trainee = {
        ...traineeData,
        traineeId: cleanTraineeId,
        email: cleanEmail,
        createdAt,
      };

      const id = await db.trainees.add(newTrainee);

      // Create login account automatically
      // Default username = email
      // Default password = Etihad@ + Trainee ID
      const defaultPassword = `Etihad@${cleanTraineeId}`;
      const passwordHash = await hashPassword(defaultPassword);

      await db.users.add({
        username: cleanEmail,
        passwordHash,
        role: 'TRAINEE',
        traineeId: cleanTraineeId,
        active: true,
        forcePasswordChange: true,
        lastLogin: null,
        lastPasswordChange: null,
      });

      // Audit Log
      await db.auditLogs.add({
        user: 'selva.master',
        action: `Created Trainee ${cleanTraineeId} (${traineeData.name})`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: cleanTraineeId,
        timestamp: Date.now(),
      });

      return { success: true, trainee: { ...newTrainee, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add trainee' };
    }
  }

  async removeTrainee(traineeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const trainee = await db.trainees.where('traineeId').equals(traineeId).first();
      if (!trainee) return { success: false, error: 'Trainee not found' };

      // Delete from trainees, users, passkeys, remarks, attendance, allocations, taskCounts, signOuts
      await db.trainees.where('traineeId').equals(traineeId).delete();
      await db.users.where('traineeId').equals(traineeId).delete();
      await db.passkeyCredentials.where('traineeId').equals(traineeId).delete();

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Removed Trainee ${traineeId} (${trainee.name})`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: traineeId,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to remove trainee' };
    }
  }

  async getBatches(): Promise<Batch[]> {
    return await db.batches.toArray();
  }

  async addBatch(name: string): Promise<{ success: boolean; batch?: Batch; error?: string }> {
    try {
      const cleanName = name.trim();
      if (!cleanName) return { success: false, error: 'Batch name cannot be empty' };

      const existing = await db.batches.where('name').equalsIgnoreCase(cleanName).first();
      if (existing) return { success: false, error: `Batch "${cleanName}" already exists.` };

      const createdAt = getUAEDateString();
      const newBatch: Batch = { name: cleanName, createdAt };
      const id = await db.batches.add(newBatch);

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Registered Batch "${cleanName}"`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true, batch: { ...newBatch, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add batch' };
    }
  }

  async deleteBatch(batchId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const batch = await db.batches.get(batchId);
      if (!batch) return { success: false, error: 'Batch not found' };

      // Check if any trainees belong to this batch
      const count = await db.trainees.where('batchId').equals(batch.name).count();
      if (count > 0) {
        return {
          success: false,
          error: `Cannot delete batch "${batch.name}" because it contains ${count} assigned trainee(s). Reassign or remove trainees first.`,
        };
      }

      await db.batches.delete(batchId);

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Deleted Batch "${batch.name}"`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete batch' };
    }
  }

  async getRemarks(traineeId: string): Promise<Remark[]> {
    return await db.remarks
      .where('traineeId')
      .equals(traineeId)
      .reverse()
      .sortBy('timestamp');
  }

  async addRemark(traineeId: string, remarkText: string, author: string): Promise<{ success: boolean; remark?: Remark; error?: string }> {
    try {
      const cleanRemark = remarkText.trim();
      if (!cleanRemark) return { success: false, error: 'Remark cannot be empty' };

      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const newRemark: Remark = {
        traineeId,
        remark: cleanRemark,
        createdBy: author,
        date,
        time,
        timestamp,
      };

      const id = await db.remarks.add(newRemark);

      await db.auditLogs.add({
        user: author,
        action: `Added Remark for Trainee ${traineeId}`,
        date,
        time,
        relatedTrainee: traineeId,
        timestamp,
      });

      return { success: true, remark: { ...newRemark, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save remark' };
    }
  }

  async deleteRemark(remarkId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const remark = await db.remarks.get(remarkId);
      if (!remark) return { success: false, error: 'Remark not found' };

      await db.remarks.delete(remarkId);

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Deleted Remark #${remarkId} for Trainee ${remark.traineeId}`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: remark.traineeId,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete remark' };
    }
  }

  async saveEnrollmentSelfie(traineeId: string, selfieBase64: string): Promise<{ success: boolean; error?: string }> {
    try {
      const trainee = await db.trainees.where('traineeId').equals(traineeId).first();
      if (!trainee) return { success: false, error: 'Trainee not found' };

      await db.trainees.update(trainee.id!, { enrollmentSelfie: selfieBase64 });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save enrollment selfie' };
    }
  }
}

export const traineeService = new DexieTraineeService();
