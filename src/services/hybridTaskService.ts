import { taskService as dexieTask } from './dexie/taskService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { TaskCount, SignOut } from '../types';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { ITaskService } from './api';

export class HybridTaskService implements ITaskService {
  async getTaskCounts(traineeId: string): Promise<TaskCount[]> {
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieTask.getTaskCounts(normId);

    try {
      const { data } = await supabase
        .from('task_counts')
        .select('*')
        .ilike('trainee_id', normId)
        .order('timestamp', { ascending: false });

      if (data && data.length > 0) {
        return data.map((t: any) => ({
          id: t.id,
          traineeId: t.trainee_id,
          taskCount: t.task_count,
          date: t.date,
          time: t.time,
          timestamp: Number(t.timestamp),
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch task counts from Supabase, checking local:', err);
    }

    return await dexieTask.getTaskCounts(normId);
  }

  async getLatestTaskCount(traineeId: string): Promise<TaskCount | null> {
    const list = await this.getTaskCounts(traineeId);
    return list.length > 0 ? list[0] : null;
  }

  async addTaskCount(
    traineeId: string,
    taskCount: number
  ): Promise<{ success: boolean; taskCount?: TaskCount; error?: string }> {
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieTask.addTaskCount(normId, taskCount);

    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const { data, error } = await supabase.from('task_counts').insert([{
        trainee_id: normId,
        task_count: taskCount,
        date,
        time,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit task count.' };

      // Sync into local Dexie cache
      try {
        await dexieTask.addTaskCount(normId, taskCount);
      } catch {
        // non-blocking
      }

      return {
        success: true,
        taskCount: {
          id: data[0].id,
          traineeId: normId,
          taskCount,
          date,
          time,
          timestamp,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit task count' };
    }
  }

  async getSignOut(traineeId: string, date: string): Promise<SignOut | null> {
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieTask.getSignOut(normId, date);

    try {
      const { data } = await supabase
        .from('sign_outs')
        .select('*')
        .ilike('trainee_id', normId)
        .eq('date', date);

      if (data && data.length > 0) {
        const s = data[0];
        return {
          id: s.id,
          traineeId: s.trainee_id,
          date: s.date,
          signOutTime: s.sign_out_time,
          timestamp: Number(s.timestamp),
        };
      }
    } catch (err) {
      console.warn('Failed to fetch sign out from Supabase, checking local:', err);
    }

    return await dexieTask.getSignOut(normId, date);
  }

  async submitSignOut(
    traineeId: string
  ): Promise<{ success: boolean; signOut?: SignOut; error?: string }> {
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieTask.submitSignOut(normId);

    try {
      const today = getUAEDateString();
      const existing = await this.getSignOut(normId, today);

      if (existing) {
        return {
          success: false,
          error: `You have already signed out today at ${existing.signOutTime}.`,
        };
      }

      const signOutTime = getUAETimeString(new Date(), true);
      const timestamp = Date.now();

      const { data, error } = await supabase.from('sign_outs').insert([{
        trainee_id: normId,
        date: today,
        sign_out_time: signOutTime,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit sign-out.' };

      try {
        await dexieTask.submitSignOut(normId);
      } catch {
        // non-blocking
      }

      return {
        success: true,
        signOut: {
          id: data[0].id,
          traineeId: normId,
          date: today,
          signOutTime,
          timestamp,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit sign-out' };
    }
  }
}

export const taskService = new HybridTaskService();
