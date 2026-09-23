import { authService as dexieAuth } from './dexie/authService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { User, Instructor } from '../types';
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
      let { data: users, error } = await supabase
        .from('users')
        .select('*')
        .ilike('username', cleanUsername);

      // Auto-repair / Seed selva.master in Supabase if missing or hash mismatch
      if (cleanUsername === 'selva.master' && password === 'Aviation@6996504++') {
        const correctHash = await hashPassword('Aviation@6996504++');
        if (!users || users.length === 0) {
          const { data: newMaster } = await supabase
            .from('users')
            .insert([{
              username: 'selva.master',
              password_hash: correctHash,
              role: 'MASTER',
              active: true,
              force_password_change: false,
              last_login: null,
              last_password_change: getUAEDateString(),
            }])
            .select();
          users = newMaster || [];
        } else if (users[0].password_hash !== correctHash) {
          await supabase
            .from('users')
            .update({ password_hash: correctHash })
            .eq('id', users[0].id);
          users[0].password_hash = correctHash;
        }
      }

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

      let resolvedRole = user.role;
      let staffNumber = user.trainee_id || '';
      let instructorName = '';

      if (user.role === 'INSTRUCTOR' || (user.trainee_id && user.trainee_id.startsWith('INSTRUCTOR:'))) {
        resolvedRole = 'INSTRUCTOR';
        const parts = (user.trainee_id || '').replace('INSTRUCTOR:', '').split('|');
        staffNumber = parts[0] || '';
        instructorName = parts[1] || user.username;
      }

      const appUser: User = {
        id: user.id,
        username: user.username,
        passwordHash: user.password_hash,
        role: resolvedRole,
        traineeId: user.trainee_id,
        staffNumber: staffNumber || user.trainee_id,
        name: instructorName || undefined,
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

  async getInstructors(): Promise<Instructor[]> {
    if (!isSupabaseConfigured || !supabase) {
      return await dexieAuth.getInstructors();
    }

    try {
      const { data: users, error } = await supabase.from('users').select('*');

      if (error || !users) {
        return await dexieAuth.getInstructors();
      }

      const instructors = users
        .filter((u: any) => u.role === 'INSTRUCTOR' || (u.trainee_id && u.trainee_id.startsWith('INSTRUCTOR:')))
        .map((u: any) => {
          let staffNumber = u.trainee_id || '';
          let name = '';
          if (staffNumber.startsWith('INSTRUCTOR:')) {
            const parts = staffNumber.replace('INSTRUCTOR:', '').split('|');
            staffNumber = parts[0] || '';
            name = parts[1] || u.username;
          }
          return {
            id: u.id,
            staffNumber: staffNumber || u.username,
            name: name || u.username,
            email: u.username,
            active: u.active,
            lastLogin: u.last_login,
            lastPasswordChange: u.last_password_change,
          };
        });

      return instructors;
    } catch (err) {
      return await dexieAuth.getInstructors();
    }
  }

  async addInstructor(
    staffNumber: string,
    name: string,
    email: string
  ): Promise<{ success: boolean; instructor?: Instructor; error?: string }> {
    // 1. Save locally to Dexie
    const localRes = await dexieAuth.addInstructor(staffNumber, name, email);
    if (!localRes.success) return localRes;

    // 2. Sync to Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const cleanEmail = email.trim().toLowerCase();
        const cleanStaff = staffNumber.trim();
        const cleanName = name.trim();
        const defaultPassword = `Etihad@${cleanStaff}`;
        const passwordHash = await hashPassword(defaultPassword);
        const now = getUAEDateString();

        let insertData: any = {
          username: cleanEmail,
          password_hash: passwordHash,
          role: 'INSTRUCTOR',
          trainee_id: `INSTRUCTOR:${cleanStaff}|${cleanName}`,
          active: true,
          force_password_change: false,
          last_login: null,
          last_password_change: now,
        };

        const { error } = await supabase.from('users').insert([insertData]);

        // If check constraint rejects 'INSTRUCTOR', fallback to 'MASTER' with encoded trainee_id
        if (error && error.code === '23514') {
          insertData.role = 'MASTER';
          await supabase.from('users').insert([insertData]);
        }
      } catch (err: any) {
        console.warn('Failed to sync new instructor to Supabase:', err);
      }
    }

    return localRes;
  }

  async removeInstructor(username: string): Promise<{ success: boolean; error?: string }> {
    await dexieAuth.removeInstructor(username);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.from('users').delete().ilike('username', username.trim().toLowerCase());
      } catch (err: any) {
        console.warn('Failed to delete instructor from Supabase:', err);
      }
    }

    return { success: true };
  }

  async resetInstructorPassword(
    username: string,
    staffNumber: string
  ): Promise<{ success: boolean; newPassword?: string; error?: string }> {
    const localRes = await dexieAuth.resetInstructorPassword(username, staffNumber);
    if (!localRes.success) return localRes;

    if (isSupabaseConfigured && supabase) {
      try {
        const defaultPassword = `Etihad@${staffNumber.trim()}`;
        const newHash = await hashPassword(defaultPassword);
        const now = getUAEDateString();

        await supabase
          .from('users')
          .update({
            password_hash: newHash,
            force_password_change: false,
            last_password_change: now,
          })
          .ilike('username', username.trim().toLowerCase());
      } catch (err: any) {
        console.warn('Failed to reset instructor password in Supabase:', err);
      }
    }

    return localRes;
  }

  async toggleInstructorStatus(username: string, active: boolean): Promise<{ success: boolean; error?: string }> {
    await dexieAuth.toggleInstructorStatus(username, active);

    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('users')
          .update({ active })
          .ilike('username', username.trim().toLowerCase());
      } catch (err: any) {
        console.warn('Failed to toggle instructor status in Supabase:', err);
      }
    }

    return { success: true };
  }
}

export const authService = new HybridAuthService();
