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

  async deleteAllocation(allocationId: number, traineeId?: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (allocationId > 0) {
        await db.allocations.delete(allocationId);
      }
      if (traineeId) {
        await db.auditLogs.add({
          user: traineeId,
          action: `Deleted Workstation Allocation Record #${allocationId}`,
          date: getUAEDateString(),
          time: getUAETimeString(),
          relatedTrainee: traineeId,
          timestamp: Date.now(),
        });
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete allocation' };
    }
  }

  async clearAllocationHistory(traineeId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const normId = (traineeId || '').trim();
      await db.allocations.where('traineeId').equals(normId).delete();
      await db.auditLogs.add({
        user: normId,
        action: `Cleared All Workstation Allocation History`,
        date: getUAEDateString(),
        time: getUAETimeString(),
        relatedTrainee: normId,
        timestamp: Date.now(),
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to clear allocation history' };
    }
  }
}

export const allocationService = new DexieAllocationService();
