import React, { useState, useEffect } from 'react';
import { AuditLog, Batch, GeofenceSettings } from '../../types';
import { auditService } from '../../services/hybridAuditService';
import { backupService } from '../../services/hybridBackupService';
import { traineeService } from '../../services/hybridTraineeService';
import { attendanceService } from '../../services/hybridAttendanceService';
import { settingsService, DEFAULT_GEOFENCE_SETTINGS } from '../../services/hybridSettingsService';
import { getUAEDateString } from '../../utils/timezone';
import { exportToCSV } from '../../utils/csv';
import { generateMatrixExcelReport } from '../../utils/excelExporter';
import { Notification } from '../../components/common/Notification';
import { Modal } from '../../components/common/Modal';
import {
  Download,
  Upload,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  Save,
  HelpCircle,
} from 'lucide-react';

export const AuditBackupTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Geofence Settings State
  const [geofence, setGeofence] = useState<GeofenceSettings>(DEFAULT_GEOFENCE_SETTINGS);
  const [savingGeofence, setSavingGeofence] = useState(false);
  const [showMapGuide, setShowMapGuide] = useState(false);

  // Backup import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Excel Generator State
  const todayStr = getUAEDateString();
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedBatch, setSelectedBatch] = useState<string>('All');
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadData = async () => {
    const list = await auditService.getAuditLogs();
    const bList = await traineeService.getBatches();
    const geo = await settingsService.getGeofenceSettings();
    setLogs(list);
    setBatches(bList);
    setGeofence(geo);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGeofence(true);
    setNotification(null);

    const res = await settingsService.saveGeofenceSettings(geofence);
    setSavingGeofence(false);

    if (res.success) {
      setNotification({
        type: 'success',
        text: `Geofence settings updated successfully! Attendance Log In Radius: ${geofence.loginRadiusMeters}m • Daily Sign Out Radius: ${geofence.signOutRadiusMeters}m.`,
      });
    } else {
      setNotification({
        type: 'error',
        text: res.error || 'Failed to save geofence settings.',
      });
    }
  };

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
          loadData();
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

  // Generate Matrix Excel Report
  const handleGenerateExcelReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    const targetStart = startDate;
    const targetEnd = dateMode === 'single' ? startDate : endDate;

    if (targetStart > targetEnd) {
      setNotification({ type: 'error', text: 'Start Date cannot be after End Date.' });
      return;
    }

    setExportingExcel(true);
    try {
      await generateMatrixExcelReport({
        startDate: targetStart,
        endDate: targetEnd,
        batchName: selectedBatch,
      });

      setNotification({
        type: 'success',
        text: `Excel Matrix Attendance Report generated and downloaded (${selectedBatch} • ${targetStart} to ${targetEnd}).`,
      });
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Failed to generate Excel report.' });
    } finally {
      setExportingExcel(false);
    }
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
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Data Management & Custom Excel Reports</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Configure GPS Geofencing radii, generate multi-date matrix Excel spreadsheets, backup/restore database, and view system audit history.
        </p>
      </div>

      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      {/* NEW: Geofence Location Restriction Control Card */}
      <div className="card" style={{ borderLeft: '5px solid #102A43', marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={20} color="#C5A059" />
            <span>GPS Geofencing Location Restriction Settings</span>
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setShowMapGuide(!showMapGuide)}
          >
            <HelpCircle size={14} />
            <span>{showMapGuide ? 'Hide Guide' : 'Google Maps Guide'}</span>
          </button>
        </div>

        {showMapGuide && (
          <div style={{ background: '#F1F5F9', border: '1px solid #CBD5E1', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <strong style={{ color: '#0A192F' }}>📍 How to find your exact Hangar Coordinates from Google Maps:</strong>
            <ol style={{ marginLeft: '1.25rem', marginTop: '0.5rem', lineHeight: '1.6' }}>
              <li>Open <strong>Google Maps</strong> on your phone or computer.</li>
              <li>Search or zoom in to your exact Etihad Engineering Hangar / Facility building.</li>
              <li><strong>Right-click</strong> (on PC) or <strong>press and hold</strong> (on phone) directly on the facility center point.</li>
              <li>Copy the numbers shown (e.g. <code>24.426700, 54.651100</code>).
                <br />• First number is <strong>Latitude</strong> (e.g. <code>24.4267</code>)
                <br />• Second number is <strong>Longitude</strong> (e.g. <code>54.6511</code>)
              </li>
              <li>Set separate radiuses in meters (e.g. <strong>500m</strong> for Attendance Log In and <strong>1000m / 1km</strong> for Daily Sign Out).</li>
            </ol>
          </div>
        )}

        <form onSubmit={handleSaveGeofence}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Geofencing Restriction</label>
              <select
                className="form-control"
                value={geofence.enabled ? 'true' : 'false'}
                onChange={(e) => setGeofence({ ...geofence, enabled: e.target.value === 'true' })}
              >
                <option value="true">● ENABLED (Location Verified)</option>
                <option value="false">○ DISABLED (No GPS Restriction)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Center Latitude</label>
              <input
                type="number"
                step="any"
                className="form-control"
                value={geofence.centerLatitude}
                onChange={(e) => setGeofence({ ...geofence, centerLatitude: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Center Longitude</label>
              <input
                type="number"
                step="any"
                className="form-control"
                value={geofence.centerLongitude}
                onChange={(e) => setGeofence({ ...geofence, centerLongitude: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Attendance Log In Radius (Meters)</label>
              <input
                type="number"
                min="10"
                max="50000"
                className="form-control"
                value={geofence.loginRadiusMeters}
                onChange={(e) => setGeofence({ ...geofence, loginRadiusMeters: parseInt(e.target.value) || 500 })}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>e.g. 500 = 0.5 km radius</span>
            </div>

            <div className="form-group">
              <label className="form-label">Daily Sign Out Radius (Meters)</label>
              <input
                type="number"
                min="10"
                max="50000"
                className="form-control"
                value={geofence.signOutRadiusMeters}
                onChange={(e) => setGeofence({ ...geofence, signOutRadiusMeters: parseInt(e.target.value) || 1000 })}
                required
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>e.g. 1000 = 1.0 km radius</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button type="submit" className="btn btn-navy btn-md" disabled={savingGeofence}>
              <Save size={16} />
              <span>{savingGeofence ? 'Saving Settings...' : 'Save Geofence Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Matrix Excel Generator Section */}
      <div className="card" style={{ borderLeft: '5px solid #C5A059', marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSpreadsheet size={20} color="#C5A059" />
            <span>Generate Matrix Excel Report</span>
          </span>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem' }}>
          Select single date or date range and batch filter to generate an Excel spreadsheet formatted with Staff Number, Name, Batch, and subdivided Date columns (Status, Log In Time, Sign Out Time).
        </p>

        <form onSubmit={handleGenerateExcelReport}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Date Selection Mode</label>
              <select
                className="form-control"
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value as 'single' | 'range')}
              >
                <option value="range">Date Range (Multiple Days)</option>
                <option value="single">Single Date</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{dateMode === 'single' ? 'Select Date' : 'Start Date'}</label>
              <input
                type="date"
                className="form-control"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (dateMode === 'single') setEndDate(e.target.value);
                }}
                required
              />
            </div>

            {dateMode === 'range' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Batch Selection</label>
              <select
                className="form-control"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <option value="All">All Batches (Option for All)</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button type="submit" className="btn btn-gold btn-lg" disabled={exportingExcel}>
              <FileSpreadsheet size={18} />
              <span>{exportingExcel ? 'Generating Excel...' : 'Generate & Download Excel Report'}</span>
            </button>
          </div>
        </form>
      </div>

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
            Export or restore complete database store snapshots (Trainees, Batches, Attendance, Allocations, Tasks, Sign-Outs, Audit Logs).
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

        {/* Quick CSV Reports Card */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileSpreadsheet size={18} color="#C5A059" />
              <span>Quick CSV Data Exports</span>
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
            Generate quick flat CSV spreadsheets for basic lists and today's attendance logs.
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
            <strong>WARNING:</strong> Importing a database backup will overwrite current database data with the snapshot contents. Please ensure you have exported a recent backup if needed.
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
