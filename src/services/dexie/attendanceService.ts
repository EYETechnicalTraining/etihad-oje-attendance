import { db } from '../../db';
import { Attendance, TraineeLogSummary, AttendanceStatus } from '../../types';
import {
  getUAEDateString,
  getUAETimeString,
  calculateAttendanceStatus,
  isPastCutoffTime,
} from '../../utils/timezone';
import { IAttendanceService } from '../api';

export class DexieAttendanceService implements IAttendanceService {
  async getDailyAttendance(date: string): Promise<Attendance[]> {
    return await db.attendance.where('date').equals(date).toArray();
  }

  async getTraineeAttendanceForDate(traineeId: string, date: string): Promise<Attendance | null> {
    const record = await db.attendance
      .where('[traineeId+date]')
      .equals([traineeId, date])
      .first();
    return record || null;
  }

  async logAttendance(
    traineeId: string,
    authMethod: 'WebAuthn/Passkey' | 'Password Fallback'
  ): Promise<{ success: boolean; attendance?: Attendance; error?: string }> {
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

      const newAttendance: Attendance = {
        traineeId,
        date: today,
        loginTime,
        status,
        authenticationMethod: authMethod,
        createdAt,
      };

      const id = await db.attendance.add(newAttendance);

      // Audit log
      await db.auditLogs.add({
        user: traineeId,
        action: `Logged Attendance (${status}) at ${loginTime}`,
        date: today,
        time: loginTime,
        relatedTrainee: traineeId,
        timestamp: Date.now(),
      });

      return { success: true, attendance: { ...newAttendance, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to log attendance' };
    }
  }

  async getTraineeLogsForDate(targetDate: string): Promise<TraineeLogSummary[]> {
    const allTrainees = await db.trainees.toArray();
    const attendanceRecords = await db.attendance.where('date').equals(targetDate).toArray();
    const signOutRecords = await db.signOuts.where('date').equals(targetDate).toArray();
    const allAllocations = await db.allocations.where('date').equals(targetDate).toArray();
    const allTaskCounts = await db.taskCounts.where('date').equals(targetDate).toArray();
    const allUsers = await db.users.toArray();
    const allPasskeys = await db.passkeyCredentials.toArray();

    const attendanceMap = new Map<string, Attendance>();
    attendanceRecords.forEach((a) => attendanceMap.set(a.traineeId, a));

    const signOutMap = new Map<string, string>();
    signOutRecords.forEach((s) => signOutMap.set(s.traineeId, s.signOutTime));

    const past8AM = isPastCutoffTime(targetDate);

    const logs: TraineeLogSummary[] = [];

    for (let i = 0; i < allTrainees.length; i++) {
      const trainee = allTrainees[i];
      const att = attendanceMap.get(trainee.traineeId);
      const signOutTime = signOutMap.get(trainee.traineeId) || '-';

      let status: AttendanceStatus = 'No Show';
      let loginTime = '-';

      if (att) {
        status = att.status;
        loginTime = att.loginTime;
      } else {
        if (!past8AM) {
          status = 'No Show'; // Standard unlogged status pending 8 AM cutoff, rendered with clear context
        } else {
          status = 'No Show'; // After 8 AM cutoff
        }
      }

      // Allocations for this trainee & date
      const allocations = allAllocations.filter((al) => al.traineeId === trainee.traineeId);
      
      // Latest Task count for this date
      const traineeTasks = allTaskCounts
        .filter((tc) => tc.traineeId === trainee.traineeId)
        .sort((a, b) => b.timestamp - a.timestamp);
      const latestTask = traineeTasks.length > 0 ? traineeTasks[0].taskCount : null;

      // User details
      const user = allUsers.find((u) => u.traineeId === trainee.traineeId || u.username === trainee.email);
      const passkeys = allPasskeys.filter((pk) => pk.traineeId === trainee.traineeId);

      logs.push({
        srNo: i + 1,
        traineeId: trainee.traineeId,
        name: trainee.name,
        batch: trainee.batchId,
        status,
        loginTime,
        signOutTime,
        allocationCount: allocations.length,
        latestTaskCount: latestTask,
        accountStatus: trainee.active ? 'Active' : 'Disabled',
        passkeyRegistered: passkeys.length > 0,
        lastPasswordChange: user?.lastPasswordChange || null,
        username: user?.username || trainee.email,
      });
    }

    return logs;
  }
}

export const attendanceService = new DexieAttendanceService();
