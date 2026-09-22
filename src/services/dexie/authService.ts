import { db } from '../../db';
import { User } from '../../types';
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
}

export const authService = new DexieAuthService();
