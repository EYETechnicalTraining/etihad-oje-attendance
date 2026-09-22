import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../types';
import { auditService } from '../../services/dexie/auditService';
import { backupService } from '../../services/dexie/backupService';
import { traineeService } from '../../services/dexie/traineeService';
import { attendanceService } from '../../services/dexie/attendanceService';
import { allocationService } from '../../services/dexie/allocationService';
import { taskService } from '../../services/dexie/taskService';
import { getUAEDateString } from '../../utils/timezone';
import { exportToCSV } from '../../utils/csv';
import { Notification } from '../../components/common/Notification';
import { Modal } from '../../components/common/Modal';
import { Download, Upload, FileSpreadsheet, ShieldCheck, AlertTriangle } from 'lucide-react';

export const AuditBackupTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadAuditLogs = async () => {
    const list = await auditService.getAuditLogs();
    setLogs(list);
  };

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const handleExportJSON = async () => {
    try {
      const jsonStr = await backupService.exportDatabase();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = getUAEDateString();
      link.href = url;
      link.download = `Etihad_OJE_Backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setNotification({ type: 'success', text: 'Complete database export downloaded successfully.' });
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Export failed.' });
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const res = await backupService.importDatabase(content);
        setImporting(false);
        setIsImportModalOpen(false);

        if (res.success) {
          setNotification({ type: 'success', text: 'Database successfully imported from backup file.' });
          loadAuditLogs();
          setTimeout(() => window.location.reload(), 1500);
        } else {
          setNotification({ type: 'error', text: res.error || 'Import failed.' });
        }
      } catch (err: any) {
        setImporting(false);
        setNotification({ type: 'error', text: 'Failed to read backup file.' });
      }
    };
    reader.readAsText(importFile);
  };

  // CSV Exports
  const exportTraineesCSV = async () => {
    const trainees = await traineeService.getAllTrainees();
    const headers = ['Trainee ID', 'Name', 'Email', 'Batch', 'Program', 'Status', 'Created Date'];
    const rows = trainees.map((t) => [
      t.traineeId,
      t.name,
      t.email,
      t.batchId,
      t.program,
      t.active ? 'Active' : 'Disabled',
      t.createdAt,
    ]);
    exportToCSV(`Etihad_Trainee_List_${getUAEDateString()}`, headers, rows);
  };

  const exportAttendanceCSV = async () => {
    const today = getUAEDateString();
    const logsData = await attendanceService.getTraineeLogsForDate(today);
    const headers = ['Staff No', 'Name', 'Batch', 'Status', 'Log In Time', 'Sign Out Time', 'Account Status'];
    const rows = logsData.map((l) => [
      l.traineeId,
      l.name,
      l.batch,
      l.status,
      l.loginTime,
      l.signOutTime,
      l.accountStatus,
    ]);
    exportToCSV(`Etihad_Attendance_Logs_${today}`, headers, rows);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Data Management & Security Audit Logs</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Database JSON backup export/import, CSV reports generation, and system audit history.
        </p>
      </div>

      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* JSON Backup Card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Download size={18} color="#C5A059" />
              <span>Database Backup & Restore</span>
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
            Export or restore complete IndexedDB store snapshots (Trainees, Batches, Attendance, Allocations, Tasks, Sign-Outs, Audit Logs).
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={handleExportJSON} className="btn btn-gold btn-sm">
              <Download size={14} />
              <span>EXPORT DATABASE</span>
            </button>
            <button onClick={() => setIsImportModalOpen(true)} className="btn btn-outline btn-sm">
              <Upload size={14} />
              <span>IMPORT DATABASE</span>
            </button>
          </div>
        </div>

        {/* CSV Reports Card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={18} color="#C5A059" />
              <span>CSV Data Export Reports</span>
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
            Generate structured CSV spreadsheets for executive reporting, attendance records, and auditing.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={exportTraineesCSV} className="btn btn-navy btn-sm">
              <FileSpreadsheet size={13} />
              <span>Trainee List CSV</span>
            </button>
            <button onClick={exportAttendanceCSV} className="btn btn-navy btn-sm">
              <FileSpreadsheet size={13} />
              <span>Attendance Logs CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={18} color="#C5A059" />
            <span>System Audit Log History</span>
          </span>
        </div>
        <div className="table-responsive">
          <table className="custom-table" style={{ fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>User / Initiator</th>
                <th>Action Description</th>
                <th>Related Trainee</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B' }}>
                    No audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ color: '#475569' }}>{log.date} {log.time}</td>
                    <td style={{ fontWeight: 700, color: '#0A192F' }}>{log.user}</td>
                    <td style={{ fontWeight: 600 }}>{log.action}</td>
                    <td>{log.relatedTrainee ? <span className="badge badge-info">{log.relatedTrainee}</span> : '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Import Confirmation Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Restore Database from JSON Backup"
      >
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} color="#B91C1C" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: '0.85rem', color: '#7F1D1D' }}>
            <strong>WARNING:</strong> Importing a database backup will overwrite current local IndexedDB data with the snapshot contents. Please ensure you have exported a recent backup if needed.
          </div>
        </div>

        <form onSubmit={handleImportSubmit}>
          <div className="form-group">
            <label className="form-label">Select JSON Backup File</label>
            <input
              type="file"
              accept=".json"
              className="form-control"
              onChange={(e) => setImportFile(e.target.files ? e.target.files[0] : null)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsImportModalOpen(false)}
              disabled={importing}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={!importFile || importing}
            >
              {importing ? 'Restoring Database...' : 'Confirm Import & Restore'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
