import { db } from '../../db';
import { TaskCount, SignOut } from '../../types';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { ITaskService } from '../api';

export class DexieTaskService implements ITaskService {
  async getTaskCounts(traineeId: string): Promise<TaskCount[]> {
    return await db.taskCounts
      .where('traineeId')
      .equals(traineeId)
      .reverse()
      .sortBy('timestamp');
  }

  async getLatestTaskCount(traineeId: string): Promise<TaskCount | null> {
    const list = await this.getTaskCounts(traineeId);
    return list.length > 0 ? list[0] : null;
  }

  async addTaskCount(
    traineeId: string,
    taskCount: number
  ): Promise<{ success: boolean; taskCount?: TaskCount; error?: string }> {
    try {
      if (isNaN(taskCount) || taskCount < 0) {
        return { success: false, error: 'Please enter a valid non-negative task count.' };
      }

      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const newTaskCount: TaskCount = {
        traineeId,
        taskCount,
        date,
        time,
        timestamp,
      };

      const id = await db.taskCounts.add(newTaskCount);

      // Audit Log
      await db.auditLogs.add({
        user: traineeId,
        action: `Submitted Task Count: ${taskCount}`,
        date,
        time,
        relatedTrainee: traineeId,
        timestamp,
      });

      return { success: true, taskCount: { ...newTaskCount, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit task count' };
    }
  }

  async getSignOut(traineeId: string, date: string): Promise<SignOut | null> {
    const record = await db.signOuts
      .where('[traineeId+date]')
      .equals([traineeId, date])
      .first();
    return record || null;
  }

  async submitSignOut(
    traineeId: string
  ): Promise<{ success: boolean; signOut?: SignOut; error?: string }> {
    try {
      const today = getUAEDateString();
      const existing = await this.getSignOut(traineeId, today);

      if (existing) {
        return {
          success: false,
          error: `You have already signed out today at ${existing.signOutTime}.`,
        };
      }

      const signOutTime = getUAETimeString(new Date(), true);
      const timestamp = Date.now();

      const newSignOut: SignOut = {
        traineeId,
        date: today,
        signOutTime,
        timestamp,
      };

      const id = await db.signOuts.add(newSignOut);

      // Audit Log
      await db.auditLogs.add({
        user: traineeId,
        action: `Submitted Daily Sign-Out at ${signOutTime}`,
        date: today,
        time: signOutTime,
        relatedTrainee: traineeId,
        timestamp,
      });

      return { success: true, signOut: { ...newSignOut, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit sign-out' };
    }
  }

  async deleteTaskCount(taskCountId: number, traineeId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (taskCountId > 0) {
        await db.taskCounts.delete(taskCountId);
      }
      if (traineeId) {
        await db.auditLogs.add({
          user: traineeId,
          action: `Deleted Task Count Record #${taskCountId}`,
          date: getUAEDateString(),
          time: getUAETimeString(),
          relatedTrainee: traineeId,
          timestamp: Date.now(),
        });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete task count' };
    }
  }

  async clearTaskHistory(traineeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normId = (traineeId || '').trim();
      await db.taskCounts.where('traineeId').equals(normId).delete();
      await db.auditLogs.add({
        user: normId,
        action: `Cleared All Task Count History`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: normId,
        timestamp: Date.now(),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear task history' };
    }
  }
}

export const taskService = new DexieTaskService();
