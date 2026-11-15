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
import { isPendingStatus, isNoShowStatus, normalizeTraineeId } from '../utils/statusUtils';

export class HybridAttendanceService implements IAttendanceService {
  private _cachedMeta: {
    trainees: any[];
    allocations: any[];
    taskCounts: any[];
    users: any[];
    passkeys: any[];
    timestamp: number;
  } | null = null;

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
    const normId = normalizeTraineeId(traineeId);
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

      const todayString = getUAEDateString();
      const isToday = date === todayString;
      const past8AMToday = isToday && isPastCutoffTime(date);
      const holidays = await holidayService.getAllHolidays();
      const isHolidayDate = holidays.some((h) => h.date === date);
      const isWeekendDay = isWeekend(date);

      if (!data || data.length === 0) {
        if (past8AMToday && !isWeekendDay && !isHolidayDate) {
          return {
            traineeId: normId,
            date,
            loginTime: '-',
            status: 'No Show',
            authenticationMethod: 'Manual Override',
            createdAt: new Date().toISOString()
          };
        }
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
    const normTraineeId = normalizeTraineeId(traineeId);
    if (!isSupabaseConfigured || !supabase) return await dexieAttendance.logAttendance(normTraineeId, authMethod);

    try {
      const today = getUAEDateString();
      // Query direct from Supabase to check existing record
      const { data: existingRows } = await supabase
        .from('attendance')
        .select('*')
        .ilike('trainee_id', normTraineeId)
        .eq('date', today);

      const existing = (existingRows && existingRows.length > 0) ? existingRows[0] : null;

      const isPending = isPendingStatus(existing?.status);
      const isNoShow = isNoShowStatus(existing?.status);

      // Trainees who are Pending or No Show (or missing loginTime or loginTime with 'pending') are ALWAYS permitted to log attendance!
      if (
        existing &&
        !isPending &&
        !isNoShow &&
        existing.login_time &&
        existing.login_time !== '-' &&
        !existing.login_time.toLowerCase().includes('pending')
      ) {
        return {
          success: false,
          error: `Attendance already registered for today (${today}) at ${existing.login_time}.`,
        };
      }

      const now = new Date();
      const loginTime = getUAETimeString(now, true);
      const calculatedStatus: AttendanceStatus = calculateAttendanceStatus(now);
      const past8AM = isPastCutoffTime(today);
      // If the trainee was previously marked as No Show or logging in after 8am cutoff, checking in registers them as 'Late to Work'!
      const status: AttendanceStatus = (isNoShow || past8AM) ? 'Late to Work' : calculatedStatus;
      const createdAt = new Date().toISOString();

      let savedId: number | undefined;

      if (existing && existing.id) {
        const { error } = await supabase
          .from('attendance')
          .update({
            login_time: loginTime,
            status,
            authentication_method: authMethod,
          })
          .eq('id', existing.id);

        if (error) return { success: false, error: error.message };
        savedId = existing.id;
      } else {
        const { data, error } = await supabase
          .from('attendance')
          .upsert([{
            trainee_id: normTraineeId,
            date: today,
            login_time: loginTime,
            status,
            authentication_method: authMethod,
            created_at: createdAt,
          }], { onConflict: 'trainee_id,date' })
          .select();

        if (error || !data || data.length === 0) {
          return { success: false, error: error?.message || 'Failed to log attendance.' };
        }
        savedId = data[0].id;
      }

      // Sync to Dexie locally
      try {
        const localRec = await dexieAttendance.getTraineeAttendanceForDate(normTraineeId, today);
        if (localRec && localRec.id) {
          await db.attendance.update(localRec.id, {
            loginTime,
            status,
            authenticationMethod: authMethod,
          });
        } else {
          await db.attendance.add({
            traineeId: normTraineeId,
            date: today,
            loginTime,
            status,
            authenticationMethod: authMethod,
            createdAt,
          });
        }
      } catch {
        // Non-blocking local sync
      }

      return {
        success: true,
        attendance: {
          id: savedId,
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

    const now = Date.now();
    if (!this._cachedMeta || now - this._cachedMeta.timestamp > 10000) {
      const [tRes, alRes, tcRes, uRes, pkRes] = await Promise.all([
        supabase.from('trainees').select('*'),
        supabase.from('allocations').select('*'),
        supabase.from('task_counts').select('*'),
        supabase.from('users').select('*'),
        supabase.from('passkey_credentials').select('*'),
      ]);
      this._cachedMeta = {
        trainees: tRes.data || [],
        allocations: alRes.data || [],
        taskCounts: tcRes.data || [],
        users: uRes.data || [],
        passkeys: pkRes.data || [],
        timestamp: now,
      };
    }

    const allTrainees = this._cachedMeta.trainees;
    const allAllocations = this._cachedMeta.allocations;
    const allTaskCounts = this._cachedMeta.taskCounts;
    const allUsers = this._cachedMeta.users;
    const allPasskeys = this._cachedMeta.passkeys;

    // ALWAYS fetch fresh attendance and sign outs for targetDate in real-time
    const [attRes, soRes] = await Promise.all([
      supabase.from('attendance').select('*').eq('date', targetDate),
      supabase.from('sign_outs').select('*').eq('date', targetDate),
    ]);
    const attendanceRecords = attRes.data || [];
    const signOutRecords = soRes.data || [];

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
        const cleanId = normalizeTraineeId(a.trainee_id);
        attendanceMap.set(cleanId, a);
        attendanceMap.set(String(a.trainee_id).trim().toUpperCase(), a);
      }
    });

    const signOutMap = new Map<string, string>();
    (signOutRecords || []).forEach((s: any) => {
      if (s.trainee_id) {
        const cleanId = normalizeTraineeId(s.trainee_id);
        signOutMap.set(cleanId, s.sign_out_time);
        signOutMap.set(String(s.trainee_id).trim().toUpperCase(), s.sign_out_time);
      }
    });

    const todayString = getUAEDateString();
    const isToday = targetDate === todayString;
    const past8AMToday = isToday && isPastCutoffTime(targetDate);
    const holidays = await holidayService.getAllHolidays();
    const isHolidayDate = holidays.some((h) => h.date === targetDate);
    const isWeekendDay = isWeekend(targetDate);

    const logs: TraineeLogSummary[] = [];

    for (let i = 0; i < sortedTrainees.length; i++) {
      const trainee = sortedTrainees[i];
      const rawId = String(trainee.trainee_id || '').trim();
      const normTraineeId = normalizeTraineeId(rawId);
      const att = attendanceMap.get(normTraineeId) || attendanceMap.get(rawId.toUpperCase());
      const signOutTime = signOutMap.get(normTraineeId) || signOutMap.get(rawId.toUpperCase()) || '-';

      let status: AttendanceStatus = 'Pending';
      let loginTime = '-';

      if (att) {
        status = att.status as AttendanceStatus;
        loginTime = att.login_time || '-';
      } else if (isWeekendDay) {
        status = 'Weekend';
        loginTime = '-';
      } else if (isHolidayDate) {
        status = 'Holiday';
        loginTime = '-';
      } else if (isToday) {
        if (!past8AMToday) {
          status = 'Pending';
          loginTime = '-';
        } else {
          status = 'No Show';
          loginTime = '-';
        }
      } else {
        status = 'Pending';
        loginTime = '-';
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
    const normTraineeId = normalizeTraineeId(traineeId);
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
      if (newStatus === 'No Show' || newStatus === 'Pending' || newStatus === 'N/A' || isPendingStatus(newStatus)) {
        computedLoginTime = '-';
        // Delete sign_outs row for No Show / Pending (case-insensitive)
        await supabase.from('sign_outs').delete().ilike('trainee_id', normTraineeId).eq('date', date);
        try {
          const allSignOuts = await db.signOuts.where('date').equals(date).toArray();
          const toDelete = allSignOuts.filter(
            (s) => normalizeTraineeId(s.traineeId) === normTraineeId
          );
          for (const s of toDelete) {
            if (s.id) await db.signOuts.delete(s.id);
          }
        } catch (_) {}
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

      if (remoteExisting && remoteExisting.id) {
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

        const { error } = await supabase.from('attendance').upsert([{
          trainee_id: normTraineeId,
          date,
          login_time: computedLoginTime,
          status: newStatus,
          authentication_method: 'Manual Override',
          created_at: createdAt,
        }], { onConflict: 'trainee_id,date' });

        if (error) {
          // If upsert fails fallback to update by trainee_id and date
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
