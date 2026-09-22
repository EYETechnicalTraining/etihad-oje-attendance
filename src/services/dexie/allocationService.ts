import { db } from '../../db';
import { Allocation } from '../../types';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { IAllocationService } from '../api';

export class DexieAllocationService implements IAllocationService {
  async getAllocations(traineeId: string): Promise<Allocation[]> {
    return await db.allocations
      .where('traineeId')
      .equals(traineeId)
      .reverse()
      .sortBy('timestamp');
  }

  async addAllocation(
    allocationData: Omit<Allocation, 'id' | 'date' | 'time' | 'timestamp'>
  ): Promise<{ success: boolean; allocation?: Allocation; error?: string }> {
    try {
      const date = getUAEDateString();
      const time = getUAETimeString();
      const timestamp = Date.now();

      const newAllocation: Allocation = {
        ...allocationData,
        date,
        time,
        timestamp,
      };

      const id = await db.allocations.add(newAllocation);

      // Audit Log
      await db.auditLogs.add({
        user: allocationData.traineeId,
        action: `Submitted Allocation (${allocationData.location} / ${allocationData.aircraftRegistration})`,
        date,
        time,
        relatedTrainee: allocationData.traineeId,
        timestamp,
      });

      return { success: true, allocation: { ...newAllocation, id } };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to submit allocation' };
    }
  }
}

export const allocationService = new DexieAllocationService();
