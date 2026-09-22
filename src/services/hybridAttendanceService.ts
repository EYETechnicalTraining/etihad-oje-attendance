import { attendanceService as dexieAttendance } from './dexie/attendanceService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Attendance, TraineeLogSummary, AttendanceStatus } from '../types';
import {
  getUAEDateString,
  getUAETimeString,
  calculateAttendanceStatus,
  isPastCutoffTime,
} from '../utils/timezone';
import { IAttendanceService } from './api';

export class HybridAttendanceService implements IAttendanceService {
  async getDailyAttendance(date: string): Promise<Attendance[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.getDailyAttendance(date);

    const { data } = await supabase.from('attendance').select('*').eq('date', date);
    if (!data) return [];
    return data.map((a: any) => ({
      id: a.id,
      traineeId: a.trainee_id,
      date: a.date,
      loginTime: a.login_time,
      status: a.status as AttendanceStatus,
      authenticationMethod: a.authentication_method,
      createdAt: a.created_at,
    }));
  }

  async getTraineeAttendanceForDate(traineeId: string, date: string): Promise<Attendance | null> {
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.getTraineeAttendanceForDate(traineeId, date);

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .eq('trainee_id', traineeId)
      .eq('date', date);

    if (!data || data.length === 0) return null;
    const a = data[0];
    return {
      id: a.id,
      traineeId: a.trainee_id,
      date: a.date,
      loginTime: a.login_time,
      status: a.status as AttendanceStatus,
      authenticationMethod: a.authentication_method,
      createdAt: a.created_at,
    };
  }

  async logAttendance(
    traineeId: string,
    authMethod: 'Biometric Passkey (Fingerprint/PIN)' | 'Face Verification Selfie' | 'Password Fallback' | 'WebAuthn/Passkey'
  ): Promise<{ success: boolean; attendance?: Attendance; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.logAttendance(traineeId, authMethod);

    try {
      const today = getUAEDateString();
      const existing = await this.getTraineeAttendanceForDate(traineeId, today);

      if (existing) {
        return {
          success: false,
          error: `Attendance already registered for today (${today}) at ${existing.loginTime}.`,
        };
      }

      const now = new Date();
      const loginTime = getUAETimeString(now, true);
      const status: AttendanceStatus = calculateAttendanceStatus(now);
      const createdAt = new Date().toISOString();

      const { data, error } = await supabase.from('attendance').insert([{
        trainee_id: traineeId,
        date: today,
        login_time: loginTime,
        status,
        authentication_method: authMethod,
        created_at: createdAt,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to log attendance.' };

      return {
        success: true,
        attendance: {
          id: data[0].id,
          traineeId,
          date: today,
          loginTime,
          status,
          authenticationMethod: authMethod,
          createdAt,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to log attendance' };
    }
  }

  async getTraineeLogsForDate(targetDate: string): Promise<TraineeLogSummary[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.getTraineeLogsForDate(targetDate);

    const { data: allTrainees } = await supabase.from('trainees').select('*');
    const { data: attendanceRecords } = await supabase.from('attendance').select('*').eq('date', targetDate);
    const { data: signOutRecords } = await supabase.from('sign_outs').select('*').eq('date', targetDate);
    const { data: allAllocations } = await supabase.from('allocations').select('*').eq('date', targetDate);
    const { data: allTaskCounts } = await supabase.from('task_counts').select('*').eq('date', targetDate);
    const { data: allUsers } = await supabase.from('users').select('*');
    const { data: allPasskeys } = await supabase.from('passkey_credentials').select('*');

    if (!allTrainees) return [];

    const attendanceMap = new Map<string, any>();
    (attendanceRecords || []).forEach((a: any) => attendanceMap.set(a.trainee_id, a));

    const signOutMap = new Map<string, string>();
    (signOutRecords || []).forEach((s: any) => signOutMap.set(s.trainee_id, s.sign_out_time));

    const logs: TraineeLogSummary[] = [];

    for (let i = 0; i < allTrainees.length; i++) {
      const trainee = allTrainees[i];
      const att = attendanceMap.get(trainee.trainee_id);
      const signOutTime = signOutMap.get(trainee.trainee_id) || '-';

      let status: AttendanceStatus = 'No Show';
      let loginTime = '-';

      if (att) {
        status = att.status as AttendanceStatus;
        loginTime = att.login_time;
      }

      const allocations = (allAllocations || []).filter((al: any) => al.trainee_id === trainee.trainee_id);
      const traineeTasks = (allTaskCounts || [])
        .filter((tc: any) => tc.trainee_id === trainee.trainee_id)
        .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));
      const latestTask = traineeTasks.length > 0 ? traineeTasks[0].task_count : null;

      const user = (allUsers || []).find((u: any) => u.trainee_id === trainee.trainee_id || u.username === trainee.email);
      const passkeys = (allPasskeys || []).filter((pk: any) => pk.trainee_id === trainee.trainee_id);

      logs.push({
        srNo: i + 1,
        traineeId: trainee.trainee_id,
        name: trainee.name,
        batch: trainee.batch_id,
        status,
        loginTime,
        signOutTime,
        allocationCount: allocations.length,
        latestTaskCount: latestTask,
        accountStatus: trainee.active ? 'Active' : 'Disabled',
        passkeyRegistered: passkeys.length > 0,
        lastPasswordChange: user?.last_password_change || null,
        username: user?.username || trainee.email,
      });
    }

    return logs;
  }

  async updateTraineeAttendanceStatus(
    traineeId: string,
    date: string,
    newStatus: AttendanceStatus
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAttendance.updateTraineeAttendanceStatus(traineeId, date, newStatus);
    }

    try {
      const existing = await this.getTraineeAttendanceForDate(traineeId, date);

      if (existing) {
        const { error } = await supabase
          .from('attendance')
          .update({ status: newStatus })
          .eq('trainee_id', traineeId)
          .eq('date', date);

        if (error) return { success: false, error: error.message };
      } else {
        const loginTime = `Manual (${newStatus})`;
        const createdAt = new Date().toISOString();

        const { error } = await supabase.from('attendance').insert([{
          trainee_id: traineeId,
          date,
          login_time: loginTime,
          status: newStatus,
          authentication_method: 'Password Fallback',
          created_at: createdAt,
        }]);

        if (error) return { success: false, error: error.message };
      }

      // Sync Dexie locally
      await dexieAttendance.updateTraineeAttendanceStatus(traineeId, date, newStatus);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update attendance status' };
    }
  }
}

export const attendanceService = new HybridAttendanceService();
