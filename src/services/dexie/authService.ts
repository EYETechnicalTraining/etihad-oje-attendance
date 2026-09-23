import { db } from '../../db';
import { User, Instructor } from '../../types';
import { hashPassword, verifyPassword } from '../../utils/security';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { IAuthService } from '../api';

export class DexieAuthService implements IAuthService {
  async login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const user = await db.users.where('username').equalsIgnoreCase(cleanUsername).first();

      if (!user) {
        return { success: false, error: 'Invalid username or password' };
      }

      if (!user.active) {
        return { success: false, error: 'This account has been disabled. Please contact the Program Manager.' };
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return { success: false, error: 'Invalid username or password' };
      }

      const nowString = getUAEDateString();
      await db.users.update(user.id!, { lastLogin: nowString });

      // Audit Log
      await db.auditLogs.add({
        user: user.username,
        action: 'User Logged In',
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: user.traineeId,
        timestamp: Date.now(),
      });

      return { success: true, user: { ...user, lastLogin: nowString } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  }

  async changePassword(username: string, currentPass: string, newPass: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await db.users.where('username').equalsIgnoreCase(username.trim()).first();
      if (!user) return { success: false, error: 'User not found' };

      const isValid = await verifyPassword(currentPass, user.passwordHash);
      if (!isValid) return { success: false, error: 'Current password is incorrect' };

      if (newPass.length < 6) return { success: false, error: 'New password must be at least 6 characters long' };

      const newHash = await hashPassword(newPass);
      const nowString = getUAEDateString();

      await db.users.update(user.id!, {
        passwordHash: newHash,
        forcePasswordChange: false,
        lastPasswordChange: nowString,
      });

      await db.auditLogs.add({
        user: username,
        action: 'Password Changed Successfully',
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: user.traineeId,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to change password' };
    }
  }

  async resetTraineePassword(traineeId: string): Promise<{ success: boolean; newPassword?: string; error?: string }> {
    try {
      const user = await db.users.where('traineeId').equals(traineeId).first();
      if (!user) return { success: false, error: 'Trainee account not found' };

      const defaultPassword = `Etihad@${traineeId}`;
      const newHash = await hashPassword(defaultPassword);
      const nowString = getUAEDateString();

      await db.users.update(user.id!, {
        passwordHash: newHash,
        forcePasswordChange: true,
        lastPasswordChange: nowString,
      });

      await db.auditLogs.add({
        user: 'selva.master',
        action: 'Reset Trainee Password',
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: traineeId,
        timestamp: Date.now(),
      });

      return { success: true, newPassword: defaultPassword };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reset password' };
    }
  }

  async toggleUserStatus(traineeId: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await db.users.where('traineeId').equals(traineeId).first();
      const trainee = await db.trainees.where('traineeId').equals(traineeId).first();

      if (user) await db.users.update(user.id!, { active });
      if (trainee) await db.trainees.update(trainee.id!, { active });

      await db.auditLogs.add({
        user: 'selva.master',
        action: active ? 'Account Enabled' : 'Account Disabled',
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: traineeId,
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update user status' };
    }
  }

  async getInstructors(): Promise<Instructor[]> {
    const users = await db.users
      .filter((u) => u.role === 'INSTRUCTOR' || (u.traineeId ? u.traineeId.startsWith('INSTRUCTOR:') : false))
      .toArray();

    return users.map((u) => {
      let staffNumber = u.staffNumber || u.traineeId || '';
      let name = u.name || '';
      if (staffNumber.startsWith('INSTRUCTOR:')) {
        const parts = staffNumber.replace('INSTRUCTOR:', '').split('|');
        staffNumber = parts[0] || '';
        name = parts[1] || name || u.username;
      }
      return {
        id: u.id,
        staffNumber: staffNumber || u.username,
        name: name || u.username,
        email: u.username,
        active: u.active,
        lastLogin: u.lastLogin,
        lastPasswordChange: u.lastPasswordChange,
      };
    });
  }

  async addInstructor(
    staffNumber: string,
    name: string,
    email: string
  ): Promise<{ success: boolean; instructor?: Instructor; error?: string }> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanStaff = staffNumber.trim();
      const cleanName = name.trim();

      if (!cleanEmail || !cleanStaff || !cleanName) {
        return { success: false, error: 'Staff number, name, and email are required.' };
      }

      const existing = await db.users.where('username').equalsIgnoreCase(cleanEmail).first();
      if (existing) {
        return { success: false, error: `Account with email "${cleanEmail}" already exists.` };
      }

      const defaultPassword = `Etihad@${cleanStaff}`;
      const passwordHash = await hashPassword(defaultPassword);
      const now = getUAEDateString();

      const newUserId = await db.users.add({
        username: cleanEmail,
        passwordHash,
        role: 'INSTRUCTOR',
        traineeId: `INSTRUCTOR:${cleanStaff}|${cleanName}`,
        staffNumber: cleanStaff,
        name: cleanName,
        active: true,
        forcePasswordChange: false,
        lastLogin: null,
        lastPasswordChange: now,
      });

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Registered New Instructor: ${cleanName} (${cleanStaff})`,
        date: now,
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return {
        success: true,
        instructor: {
          id: newUserId,
          staffNumber: cleanStaff,
          name: cleanName,
          email: cleanEmail,
          active: true,
          lastLogin: null,
          lastPasswordChange: now,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to add instructor.' };
    }
  }

  async removeInstructor(username: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await db.users.where('username').equalsIgnoreCase(username.trim().toLowerCase()).first();
      if (!user) return { success: false, error: 'Instructor not found.' };

      await db.users.delete(user.id!);

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Removed Instructor Account: ${username}`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to remove instructor.' };
    }
  }

  async resetInstructorPassword(
    username: string,
    staffNumber: string
  ): Promise<{ success: boolean; newPassword?: string; error?: string }> {
    try {
      const user = await db.users.where('username').equalsIgnoreCase(username.trim().toLowerCase()).first();
      if (!user) return { success: false, error: 'Instructor not found.' };

      const defaultPassword = `Etihad@${staffNumber.trim()}`;
      const newHash = await hashPassword(defaultPassword);
      const nowString = getUAEDateString();

      await db.users.update(user.id!, {
        passwordHash: newHash,
        forcePasswordChange: false,
        lastPasswordChange: nowString,
      });

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Reset Instructor Password for ${username}`,
        date: nowString,
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true, newPassword: defaultPassword };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reset instructor password.' };
    }
  }

  async toggleInstructorStatus(username: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await db.users.where('username').equalsIgnoreCase(username.trim().toLowerCase()).first();
      if (!user) return { success: false, error: 'Instructor not found.' };

      await db.users.update(user.id!, { active });

      await db.auditLogs.add({
        user: 'selva.master',
        action: `Instructor Account ${active ? 'Enabled' : 'Disabled'}: ${username}`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to toggle instructor status.' };
    }
  }
}

export const authService = new DexieAuthService();
