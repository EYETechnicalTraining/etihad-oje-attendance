import { allocationService as dexieAllocation } from './dexie/allocationService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Allocation } from '../types';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { IAllocationService } from './api';
import { auditService } from './hybridAuditService';

export class HybridAllocationService implements IAllocationService {
  async getAllocations(traineeId: string): Promise<Allocation[]> {
    const normId = (traineeId || '').trim();
    if (!isSupabaseConfigured || !supabase) return await dexieAllocation.getAllocations(normId);

    try {
      const { data } = await supabase
        .from('allocations')
        .select('*')
        .ilike('trainee_id', normId)
        .order('timestamp', { ascending: false });

      if (data && data.length > 0) {
        return data.map((a: any) => ({
          id: a.id,
          traineeId: a.trainee_id,
          location: a.location,
          insideOutside: a.inside_outside,
          aircraftRegistration: a.aircraft_registration,
          aircraftType: a.aircraft_type,
          manager: a.manager,
          engineer: a.engineer,
          date: a.date,
          time: a.time,
          timestamp: Number(a.timestamp),
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch allocations from Supabase, checking local:', err);
    }

    return await dexieAllocation.getAllocations(normId);
  }

  async addAllocation(
    allocationData: Omit<Allocation, 'id' | 'date' | 'time' | 'timestamp'>
  ): Promise<{ success: boolean; allocation?: Allocation; error?: string }> {
    const normId = allocationData.traineeId.trim();
    const cleanData = { ...allocationData, traineeId: normId };

    if (!isSupabaseConfigured || !supabase) return await dexieAllocation.addAllocation(cleanData);

    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const { data, error } = await supabase.from('allocations').insert([{
        trainee_id: normId,
        location: cleanData.location,
        inside_outside: cleanData.insideOutside,
        aircraft_registration: cleanData.aircraftRegistration,
        aircraft_type: cleanData.aircraftType,
        manager: cleanData.manager,
        engineer: cleanData.engineer,
        date,
        time,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit allocation.' };

      // Sync into local Dexie cache
      try {
        await dexieAllocation.addAllocation(cleanData);
      } catch {
        // non-blocking
      }

      return {
        success: true,
        allocation: {
          id: data[0].id,
          ...cleanData,
          date,
          time,
          timestamp,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit allocation' };
    }
  }

  async deleteAllocation(allocationId: number, traineeId?: string): Promise<{ success: boolean; error?: string }> {
    const normId = (traineeId || '').trim();

    // 1. Delete in Dexie cache
    try {
      await dexieAllocation.deleteAllocation(allocationId, normId);
    } catch {
      // non-blocking
    }

    if (!isSupabaseConfigured || !supabase) return { success: true };

    try {
      const { error } = await supabase
        .from('allocations')
        .delete()
        .eq('id', allocationId);

      if (error) {
        console.warn('Failed to delete allocation from Supabase:', error);
        return { success: false, error: error.message };
      }

      if (normId) {
        auditService.logAction(normId, `Deleted Workstation Allocation Record #${allocationId}`, normId).catch(() => {});
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete allocation' };
    }
  }

  async clearAllocationHistory(traineeId: string): Promise<{ success: boolean; error?: string }> {
    const normId = (traineeId || '').trim();

    // Clear Dexie
    try {
      await dexieAllocation.clearAllocationHistory(normId);
    } catch {
      // non-blocking
    }

    if (!isSupabaseConfigured || !supabase) return { success: true };

    try {
      const { error } = await supabase
        .from('allocations')
        .delete()
        .ilike('trainee_id', normId);

      if (error) {
        return { success: false, error: error.message };
      }

      auditService.logAction(normId, `Cleared All Workstation Allocation History`, normId).catch(() => {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear allocation history' };
    }
  }
}

export const allocationService = new HybridAllocationService();
