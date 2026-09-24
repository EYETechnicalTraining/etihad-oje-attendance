import { db } from '../db';
import { attendanceService as dexieAttendance } from './dexie/attendanceService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Attendance, TraineeLogSummary, AttendanceStatus } from '../types';
import {
  getUAEDateString,
  getUAETimeString,
  calculateAttendanceStatus,
  isPastCutoffTime,
  isWeekend,
} from '../utils/timezone';
import { IAttendanceService } from './api';
import { holidayService } from './hybridHolidayService';

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
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.getTraineeAttendanceForDate(normId, date);

    const { data } = await supabase
      .from('attendance')
      .select('*')
      .ilike('trainee_id', normId)
      .eq('date', date);

    if (!data || data.length === 0) {
      return await dexieAttendance.getTraineeAttendanceForDate(normId, date);
    }
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
    const normTraineeId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.logAttendance(normTraineeId, authMethod);

    try {
      const today = getUAEDateString();
      const existing = await this.getTraineeAttendanceForDate(normTraineeId, today);

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
        trainee_id: normTraineeId,
        date: today,
        login_time: loginTime,
        status,
        authentication_method: authMethod,
        created_at: createdAt,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to log attendance.' };

      // Sync to Dexie locally
      try {
        await db.attendance.add({
          traineeId: normTraineeId,
          date: today,
          loginTime,
          status,
          authenticationMethod: authMethod,
          createdAt,
        });
      } catch (dexieErr) {
        // Non-blocking local sync
      }

      return {
        success: true,
        attendance: {
          id: data[0].id,
          traineeId: normTraineeId,
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
    (attendanceRecords || []).forEach((a: any) => {
      if (a.trainee_id) {
        attendanceMap.set(String(a.trainee_id).trim().toUpperCase(), a);
      }
    });

    const signOutMap = new Map<string, string>();
    (signOutRecords || []).forEach((s: any) => {
      if (s.trainee_id) {
        signOutMap.set(String(s.trainee_id).trim().toUpperCase(), s.sign_out_time);
      }
    });

    const past8AM = isPastCutoffTime(targetDate);
    const holidays = await holidayService.getAllHolidays();
    const isHolidayDate = holidays.some((h) => h.date === targetDate);
    const isWeekendDay = isWeekend(targetDate);

    const logs: TraineeLogSummary[] = [];

    for (let i = 0; i < allTrainees.length; i++) {
      const trainee = allTrainees[i];
      const normTraineeId = String(trainee.trainee_id || '').trim().toUpperCase();
      const att = attendanceMap.get(normTraineeId);
      const signOutTime = signOutMap.get(normTraineeId) || '-';

      let status: AttendanceStatus = 'No Show';
      let loginTime = '-';

      if (att) {
        status = att.status as AttendanceStatus;
        loginTime = att.login_time;
      } else if (isWeekendDay) {
        status = 'Weekend';
      } else if (isHolidayDate) {
        status = 'Holiday';
      } else {
        if (!past8AM) {
          status = 'N/A'; // Pending 08:00 AM cutoff
        } else {
          status = 'No Show'; // After 08:00 AM cutoff
        }
      }

      if (status === 'No Show') {
        loginTime = '-';
      } else if (status === 'Late to Work') {
        if (!loginTime || loginTime === '-' || loginTime.startsWith('Manual') || loginTime === 'Logged after 7:30 AM') {
          loginTime = 'Logged in after 7:30 am';
        }
      } else if (status === 'Present') {
        if (!loginTime || loginTime === '-' || loginTime === 'Manual (Present)') {
          loginTime = 'Logged in before 7:30am';
        }
      }

      const effectiveSignOutTime = status === 'No Show' ? '-' : signOutTime;

      const allocations = (allAllocations || []).filter(
        (al: any) => String(al.trainee_id || '').trim().toUpperCase() === normTraineeId
      );
      const traineeTasks = (allTaskCounts || [])
        .filter((tc: any) => String(tc.trainee_id || '').trim().toUpperCase() === normTraineeId)
        .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));
      const latestTask = traineeTasks.length > 0 ? traineeTasks[0].task_count : null;

      const user = (allUsers || []).find(
        (u: any) =>
          (u.trainee_id && String(u.trainee_id).trim().toUpperCase() === normTraineeId) ||
          (u.username && trainee.email && u.username.trim().toLowerCase() === trainee.email.trim().toLowerCase())
      );
      const passkeys = (allPasskeys || []).filter(
        (pk: any) => String(pk.trainee_id || '').trim().toUpperCase() === normTraineeId
      );

      logs.push({
        srNo: i + 1,
        traineeId: trainee.trainee_id,
        name: trainee.name,
        batch: trainee.batch_id,
        status,
        loginTime,
        signOutTime: effectiveSignOutTime,
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
    newStatus: AttendanceStatus,
    prevStatus?: AttendanceStatus,
    existingLoginTime?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAttendance.updateTraineeAttendanceStatus(traineeId, date, newStatus, prevStatus, existingLoginTime);
    }

    try {
      const existing = await this.getTraineeAttendanceForDate(traineeId, date);

      let computedLoginTime = '-';
      if (newStatus === 'No Show') {
        computedLoginTime = '-';
        // Delete sign_outs row for No Show
        await supabase.from('sign_outs').delete().eq('trainee_id', traineeId).eq('date', date);
      } else if (newStatus === 'Late to Work') {
        computedLoginTime = 'Logged in after 7:30 am';
      } else if (newStatus === 'Present') {
        const effectivePrevStatus = prevStatus || existing?.status;
        const effectivePrevLoginTime = existingLoginTime || existing?.loginTime;

        if (effectivePrevStatus === 'Late to Work' && effectivePrevLoginTime && effectivePrevLoginTime !== '-' && effectivePrevLoginTime !== 'N/A') {
          computedLoginTime = effectivePrevLoginTime;
        } else if (
          effectivePrevStatus === 'No Show' ||
          !effectivePrevLoginTime ||
          effectivePrevLoginTime === '-' ||
          effectivePrevLoginTime === 'N/A' ||
          effectivePrevLoginTime.startsWith('Manual')
        ) {
          computedLoginTime = 'Logged in before 7:30am';
        } else {
          computedLoginTime = effectivePrevLoginTime;
        }
      } else {
        computedLoginTime = `Manual (${newStatus})`;
      }

      if (existing) {
        const { error } = await supabase
          .from('attendance')
          .update({
            status: newStatus,
            login_time: computedLoginTime,
          })
          .eq('trainee_id', traineeId)
          .eq('date', date);

        if (error) return { success: false, error: error.message };
      } else {
        const createdAt = new Date().toISOString();

        const { error } = await supabase.from('attendance').insert([{
          trainee_id: traineeId,
          date,
          login_time: computedLoginTime,
          status: newStatus,
          authentication_method: 'Password Fallback',
          created_at: createdAt,
        }]);

        if (error) return { success: false, error: error.message };
      }

      // Sync Dexie locally
      await dexieAttendance.updateTraineeAttendanceStatus(traineeId, date, newStatus, prevStatus, existingLoginTime);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update attendance status' };
    }
  }
}

export const attendanceService = new HybridAttendanceService();
