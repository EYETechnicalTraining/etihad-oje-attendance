import { authService as dexieAuth } from './dexie/authService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { User } from '../types';
import { hashPassword, verifyPassword } from '../utils/security';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { IAuthService } from './api';

export class HybridAuthService implements IAuthService {
  async login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAuth.login(username, password);
    }

    try {
      const cleanUsername = username.trim().toLowerCase();
      const { data: users, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', cleanUsername);

      if (error || !users || users.length === 0) {
        return { success: false, error: 'Invalid username or password' };
      }

      const user = users[0];
      if (!user.active) {
        return { success: false, error: 'This account has been disabled. Please contact the Program Manager.' };
      }

      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return { success: false, error: 'Invalid username or password' };
      }

      const nowString = getUAEDateString();
      await supabase.from('users').update({ last_login: nowString }).eq('id', user.id);

      const appUser: User = {
        id: user.id,
        username: user.username,
        passwordHash: user.password_hash,
        role: user.role,
        traineeId: user.trainee_id,
        active: user.active,
        forcePasswordChange: user.force_password_change,
        lastLogin: nowString,
        lastPasswordChange: user.last_password_change,
      };

      return { success: true, user: appUser };
    } catch (err: any) {
      return { success: false, error: err.message || 'Login failed' };
    }
  }

  async changePassword(username: string, currentPass: string, newPass: string): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAuth.changePassword(username, currentPass, newPass);
    }

    try {
      const { data: users } = await supabase.from('users').select('*').eq('username', username.trim());
      if (!users || users.length === 0) return { success: false, error: 'User not found' };

      const user = users[0];
      const isValid = await verifyPassword(currentPass, user.password_hash);
      if (!isValid) return { success: false, error: 'Current password is incorrect' };

      const newHash = await hashPassword(newPass);
      const nowString = getUAEDateString();

      await supabase
        .from('users')
        .update({
          password_hash: newHash,
          force_password_change: false,
          last_password_change: nowString,
        })
        .eq('id', user.id);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to change password' };
    }
  }

  async resetTraineePassword(traineeId: string): Promise<{ success: boolean; newPassword?: string; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAuth.resetTraineePassword(traineeId);
    }

    try {
      const { data: users } = await supabase.from('users').select('*').eq('trainee_id', traineeId);
      if (!users || users.length === 0) return { success: false, error: 'Trainee account not found' };

      const defaultPassword = `Etihad@${traineeId}`;
      const newHash = await hashPassword(defaultPassword);
      const nowString = getUAEDateString();

      await supabase
        .from('users')
        .update({
          password_hash: newHash,
          force_password_change: true,
          last_password_change: nowString,
        })
        .eq('id', users[0].id);

      return { success: true, newPassword: defaultPassword };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reset password' };
    }
  }

  async toggleUserStatus(traineeId: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAuth.toggleUserStatus(traineeId, active);
    }

    try {
      await supabase.from('users').update({ active }).eq('trainee_id', traineeId);
      await supabase.from('trainees').update({ active }).eq('trainee_id', traineeId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update user status' };
    }
  }
}

export const authService = new HybridAuthService();
