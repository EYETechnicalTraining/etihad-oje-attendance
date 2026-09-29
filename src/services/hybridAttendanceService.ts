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

    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .ilike('trainee_id', normId)
        .eq('date', date);

      if (error) {
        console.warn('Supabase getTraineeAttendanceForDate error:', error);
        return await dexieAttendance.getTraineeAttendanceForDate(normId, date);
      }

      if (!data || data.length === 0) {
        return null;
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
    } catch {
      return await dexieAttendance.getTraineeAttendanceForDate(normId, date);
    }
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

      if (existing && existing.status !== 'No Show') {
        return {
          success: false,
          error: `Attendance already registered for today (${today}) at ${existing.loginTime}.`,
        };
      }

      const now = new Date();
      const loginTime = getUAETimeString(now, true);
      const status: AttendanceStatus = calculateAttendanceStatus(now);
      const createdAt = new Date().toISOString();

      if (existing) {
        const { error } = await supabase
          .from('attendance')
          .update({
            login_time: loginTime,
            status,
            authentication_method: authMethod,
          })
          .eq('id', existing.id);

        if (error) return { success: false, error: error.message };

        // Sync to Dexie
        try {
          const localRec = await dexieAttendance.getTraineeAttendanceForDate(normTraineeId, today);
          if (localRec && localRec.id) {
            await db.attendance.update(localRec.id, {
              loginTime,
              status,
              authenticationMethod: authMethod,
            });
          }
        } catch {
          // non-blocking
        }

        return {
          success: true,
          attendance: {
            ...existing,
            loginTime,
            status,
            authenticationMethod: authMethod,
          },
        };
      }

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
    const { data: allAllocations } = await supabase.from('allocations').select('*');
    const { data: allTaskCounts } = await supabase.from('task_counts').select('*');
    const { data: allUsers } = await supabase.from('users').select('*');
    const { data: allPasskeys } = await supabase.from('passkey_credentials').select('*');

    if (!allTrainees) return [];

    const sortedTrainees = [...allTrainees].sort((a: any, b: any) => {
      const batchA = (a.batch_id || '').trim();
      const batchB = (b.batch_id || '').trim();
      const bComp = batchA.localeCompare(batchB, undefined, { numeric: true, sensitivity: 'base' });
      if (bComp !== 0) return bComp;
      const idA = String(a.trainee_id || '').trim();
      const idB = String(b.trainee_id || '').trim();
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });

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

    for (let i = 0; i < sortedTrainees.length; i++) {
      const trainee = sortedTrainees[i];
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

      const traineeAllocations = (allAllocations || [])
        .filter((al: any) => String(al.trainee_id || '').trim().toUpperCase() === normTraineeId)
        .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));

      // Prioritize allocation on targetDate, otherwise fall back to latest overall allocation
      const dateAllocation = traineeAllocations.find((al: any) => al.date === targetDate);
      const activeAllocation = dateAllocation || (traineeAllocations.length > 0 ? traineeAllocations[0] : null);
      const latestAircraft = activeAllocation
        ? (activeAllocation.aircraft_registration || activeAllocation.aircraftRegistration || null)
        : null;

      const traineeTasks = (allTaskCounts || [])
        .filter((tc: any) => String(tc.trainee_id || '').trim().toUpperCase() === normTraineeId)
        .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp));

      // Prioritize task count on targetDate, otherwise fall back to latest overall task count
      const dateTask = traineeTasks.find((tc: any) => tc.date === targetDate);
      const activeTask = dateTask || (traineeTasks.length > 0 ? traineeTasks[0] : null);
      const latestTask = activeTask ? activeTask.task_count : null;

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
        allocationCount: traineeAllocations.length,
        latestAllocationAircraft: latestAircraft,
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
    const normTraineeId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAttendance.updateTraineeAttendanceStatus(normTraineeId, date, newStatus, prevStatus, existingLoginTime);
    }

    try {
      // Direct query to Supabase to verify if a remote row actually exists
      const { data: remoteRows } = await supabase
        .from('attendance')
        .select('*')
        .ilike('trainee_id', normTraineeId)
        .eq('date', date);

      const remoteExisting = (remoteRows && remoteRows.length > 0) ? remoteRows[0] : null;

      let computedLoginTime = '-';
      if (newStatus === 'No Show') {
        computedLoginTime = '-';
        // Delete sign_outs row for No Show (case-insensitive)
        await supabase.from('sign_outs').delete().ilike('trainee_id', normTraineeId).eq('date', date);
      } else if (newStatus === 'Late to Work') {
        computedLoginTime = 'Logged in after 7:30 am';
      } else if (newStatus === 'Present') {
        const effectivePrevStatus = prevStatus || remoteExisting?.status;
        const effectivePrevLoginTime = existingLoginTime || remoteExisting?.login_time;

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

      if (remoteExisting) {
        const { error } = await supabase
          .from('attendance')
          .update({
            status: newStatus,
            login_time: computedLoginTime,
          })
          .eq('id', remoteExisting.id);

        if (error) return { success: false, error: error.message };
      } else {
        const createdAt = new Date().toISOString();

        const { error } = await supabase.from('attendance').insert([{
          trainee_id: normTraineeId,
          date,
          login_time: computedLoginTime,
          status: newStatus,
          authentication_method: 'Manual Override',
          created_at: createdAt,
        }]);

        if (error) {
          // If insert fails due to race condition or constraint, fallback to update by trainee_id and date
          const { error: updateError } = await supabase
            .from('attendance')
            .update({
              status: newStatus,
              login_time: computedLoginTime,
            })
            .ilike('trainee_id', normTraineeId)
            .eq('date', date);

          if (updateError) return { success: false, error: updateError.message || error.message };
        }
      }

      // Sync Dexie locally
      await dexieAttendance.updateTraineeAttendanceStatus(normTraineeId, date, newStatus, prevStatus, existingLoginTime);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update attendance status' };
    }
  }
}

export const attendanceService = new HybridAttendanceService();
