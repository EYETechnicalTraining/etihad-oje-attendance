import { db, initializeDatabase } from '../../db';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { IBackupService } from '../api';

export class DexieBackupService implements IBackupService {
  async exportDatabase(): Promise<string> {
    const exportData = {
      app: 'Etihad Engineering OJE Trainee Management',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      stores: {
        users: await db.users.toArray(),
        trainees: await db.trainees.toArray(),
        batches: await db.batches.toArray(),
        remarks: await db.remarks.toArray(),
        attendance: await db.attendance.toArray(),
        allocations: await db.allocations.toArray(),
        taskCounts: await db.taskCounts.toArray(),
        signOuts: await db.signOuts.toArray(),
        passkeyCredentials: await db.passkeyCredentials.toArray(),
        settings: await db.settings.toArray(),
        auditLogs: await db.auditLogs.toArray(),
      },
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importDatabase(jsonString: string): Promise<{ success: boolean; error?: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || !parsed.stores) {
        return { success: false, error: 'Invalid backup file format. Missing stores data.' };
      }

      const { stores } = parsed;

      // Clear existing stores in transaction
      await db.transaction(
        'rw',
        [
          db.users,
          db.trainees,
          db.batches,
          db.remarks,
          db.attendance,
          db.allocations,
          db.taskCounts,
          db.signOuts,
          db.passkeyCredentials,
          db.settings,
          db.auditLogs,
        ],
        async () => {
          await db.users.clear();
          await db.trainees.clear();
          await db.batches.clear();
          await db.remarks.clear();
          await db.attendance.clear();
          await db.allocations.clear();
          await db.taskCounts.clear();
          await db.signOuts.clear();
          await db.passkeyCredentials.clear();
          await db.settings.clear();
          await db.auditLogs.clear();

          if (Array.isArray(stores.users)) await db.users.bulkAdd(stores.users);
          if (Array.isArray(stores.trainees)) await db.trainees.bulkAdd(stores.trainees);
          if (Array.isArray(stores.batches)) await db.batches.bulkAdd(stores.batches);
          if (Array.isArray(stores.remarks)) await db.remarks.bulkAdd(stores.remarks);
          if (Array.isArray(stores.attendance)) await db.attendance.bulkAdd(stores.attendance);
          if (Array.isArray(stores.allocations)) await db.allocations.bulkAdd(stores.allocations);
          if (Array.isArray(stores.taskCounts)) await db.taskCounts.bulkAdd(stores.taskCounts);
          if (Array.isArray(stores.signOuts)) await db.signOuts.bulkAdd(stores.signOuts);
          if (Array.isArray(stores.passkeyCredentials))
            await db.passkeyCredentials.bulkAdd(stores.passkeyCredentials);
          if (Array.isArray(stores.settings)) await db.settings.bulkAdd(stores.settings);
          if (Array.isArray(stores.auditLogs)) await db.auditLogs.bulkAdd(stores.auditLogs);
        }
      );

      // Re-initialize master account if missing after import
      await initializeDatabase();

      await db.auditLogs.add({
        user: 'selva.master',
        action: 'Database Imported from Backup',
        date: getUAEDateString(),
        time: getUAETimeString(),
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to import backup JSON.' };
    }
  }
}

export const backupService = new DexieBackupService();
