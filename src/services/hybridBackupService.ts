import { backupService as dexieBackup } from './dexie/backupService';
import { IBackupService } from './api';

export class HybridBackupService implements IBackupService {
  async exportDatabase(): Promise<string> {
    return await dexieBackup.exportDatabase();
  }

  async importDatabase(jsonString: string): Promise<{ success: boolean; error?: string }> {
    return await dexieBackup.importDatabase(jsonString);
  }
}

export const backupService = new HybridBackupService();
