import * as XLSX from 'xlsx';
import { Trainee, Batch } from '../types';
import { traineeService } from '../services/hybridTraineeService';
import { attendanceService } from '../services/hybridAttendanceService';
import { taskService } from '../services/hybridTaskService';
import { getDatesInRange, formatDisplayDate, isWeekend } from './timezone';

export interface ExcelExportOptions {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  batchName: string; // "All" or specific batch name
}

export async function generateMatrixExcelReport(options: ExcelExportOptions): Promise<void> {
  const { startDate, endDate, batchName } = options;

  // 1. Fetch Trainees
  let trainees = await traineeService.getAllTrainees();
  if (batchName && batchName !== 'All') {
    trainees = trainees.filter((t) => t.batchId === batchName);
  }

  // Sort trainees by ID
  trainees.sort((a, b) => a.traineeId.localeCompare(b.traineeId, undefined, { numeric: true }));

  // 2. Dates in range
  const dates = getDatesInRange(startDate, endDate);

  // 3. Build Headers
  // Row 1: Staff Number, Name, Batch, [Date 1], [empty], [empty], [Date 2], [empty], [empty]...
  // Row 2: "", "", "", Status, Log In Time, Sign Out Time, Status, Log In Time, Sign Out Time...

  const headerRow1: string[] = ['Staff Number', 'Name', 'Batch'];
  const headerRow2: string[] = ['', '', ''];

  dates.forEach((dateStr) => {
    const isWknd = isWeekend(dateStr);
    const dateTitle = `${dateStr} (${isWknd ? 'Weekend' : formatDisplayDate(dateStr, false)})`;
    
    headerRow1.push(dateTitle, '', '');
    headerRow2.push('Status', 'Log In Time', 'Sign Out Time');
  });

  const matrixData: (string | number)[][] = [headerRow1, headerRow2];

  // 4. Fetch Attendance & SignOut records for all dates
  for (const trainee of trainees) {
    const row: (string | number)[] = [
      trainee.traineeId,
      trainee.name,
      trainee.batchId,
    ];

    for (const dateStr of dates) {
      const isWknd = isWeekend(dateStr);
      const att = await attendanceService.getTraineeAttendanceForDate(trainee.traineeId, dateStr);
      const signOut = await taskService.getSignOut(trainee.traineeId, dateStr);

      let status = 'No Show';
      let loginTime = '-';
      let signOutTime = signOut ? signOut.signOutTime : '-';

      if (att) {
        status = att.status;
        loginTime = att.loginTime;
      } else if (isWknd) {
        status = 'Weekend';
      }

      row.push(status, loginTime, signOutTime);
    }

    matrixData.push(row);
  }

  // 5. Generate SheetJS Workbook
  const worksheet = XLSX.utils.aoa_to_sheet(matrixData);

  // Set merges for date headers (merging 3 sub-columns per date in Row 1)
  const merges: XLSX.Range[] = [];
  
  // Merge Staff Number, Name, Batch across row 1 & 2
  merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }); // Staff Number
  merges.push({ s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }); // Name
  merges.push({ s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }); // Batch

  let colIdx = 3;
  dates.forEach(() => {
    merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + 2 } });
    colIdx += 3;
  });

  worksheet['!merges'] = merges;

  // Set column widths
  const colWidths = [
    { wch: 15 }, // Staff Number
    { wch: 24 }, // Name
    { wch: 16 }, // Batch
  ];
  dates.forEach(() => {
    colWidths.push({ wch: 15 }, { wch: 14 }, { wch: 14 });
  });
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');

  // File Name
  const fileNameBatch = batchName === 'All' ? 'All_Batches' : batchName.replace(/\s+/g, '_');
  const filename = `Etihad_OJE_Attendance_${fileNameBatch}_${startDate}_to_${endDate}.xlsx`;

  XLSX.writeFile(workbook, filename);
}
