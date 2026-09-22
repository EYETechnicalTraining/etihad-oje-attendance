import { taskService as dexieTask } from './dexie/taskService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { TaskCount, SignOut } from '../types';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { ITaskService } from './api';

export class HybridTaskService implements ITaskService {
  async getTaskCounts(traineeId: string): Promise<TaskCount[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieTask.getTaskCounts(traineeId);

    const { data } = await supabase
      .from('task_counts')
      .select('*')
      .eq('trainee_id', traineeId)
      .order('timestamp', { ascending: false });

    if (!data) return [];
    return data.map((t: any) => ({
      id: t.id,
      traineeId: t.trainee_id,
      taskCount: t.task_count,
      date: t.date,
      time: t.time,
      timestamp: Number(t.timestamp),
    }));
  }

  async getLatestTaskCount(traineeId: string): Promise<TaskCount | null> {
    const list = await this.getTaskCounts(traineeId);
    return list.length > 0 ? list[0] : null;
  }

  async addTaskCount(
    traineeId: string,
    taskCount: number
  ): Promise<{ success: boolean; taskCount?: TaskCount; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieTask.addTaskCount(traineeId, taskCount);

    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const { data, error } = await supabase.from('task_counts').insert([{
        trainee_id: traineeId,
        task_count: taskCount,
        date,
        time,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit task count.' };

      return {
        success: true,
        taskCount: {
          id: data[0].id,
          traineeId,
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
    if (!isSupabaseConfigured || !supabase) return await dexieTask.getSignOut(traineeId, date);

    const { data } = await supabase
      .from('sign_outs')
      .select('*')
      .eq('trainee_id', traineeId)
      .eq('date', date);

    if (!data || data.length === 0) return null;
    const s = data[0];
    return {
      id: s.id,
      traineeId: s.trainee_id,
      date: s.date,
      signOutTime: s.sign_out_time,
      timestamp: Number(s.timestamp),
    };
  }

  async submitSignOut(
    traineeId: string
  ): Promise<{ success: boolean; signOut?: SignOut; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieTask.submitSignOut(traineeId);

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

      const { data, error } = await supabase.from('sign_outs').insert([{
        trainee_id: traineeId,
        date: today,
        sign_out_time: signOutTime,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit sign-out.' };

      return {
        success: true,
        signOut: {
          id: data[0].id,
          traineeId,
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
