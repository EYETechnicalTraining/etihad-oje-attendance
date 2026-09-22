import { allocationService as dexieAllocation } from './dexie/allocationService';
import { supabase, isSupabaseConfigured } from './supabase/client';
import { Allocation } from '../types';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';
import { IAllocationService } from './api';

export class HybridAllocationService implements IAllocationService {
  async getAllocations(traineeId: string): Promise<Allocation[]> {
    if (!isSupabaseConfigured || !supabase) return await dexieAllocation.getAllocations(traineeId);

    const { data } = await supabase
      .from('allocations')
      .select('*')
      .eq('trainee_id', traineeId)
      .order('timestamp', { ascending: false });

    if (!data) return [];
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

  async addAllocation(
    allocationData: Omit<Allocation, 'id' | 'date' | 'time' | 'timestamp'>
  ): Promise<{ success: boolean; allocation?: Allocation; error?: string }> {
    if (!isSupabaseConfigured || !supabase) return await dexieAllocation.addAllocation(allocationData);

    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const { data, error } = await supabase.from('allocations').insert([{
        trainee_id: allocationData.traineeId,
        location: allocationData.location,
        inside_outside: allocationData.insideOutside,
        aircraft_registration: allocationData.aircraftRegistration,
        aircraft_type: allocationData.aircraftType,
        manager: allocationData.manager,
        engineer: allocationData.engineer,
        date,
        time,
        timestamp,
      }]).select();

      if (error || !data) return { success: false, error: error?.message || 'Failed to submit allocation.' };

      return {
        success: true,
        allocation: {
          id: data[0].id,
          ...allocationData,
          date,
          time,
          timestamp,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit allocation' };
    }
  }
}

export const allocationService = new HybridAllocationService();
