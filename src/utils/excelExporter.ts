import XLSX from 'xlsx-js-style';
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
    { wch: 16 }, // Staff Number
    { wch: 26 }, // Name
    { wch: 16 }, // Batch
  ];
  dates.forEach(() => {
    colWidths.push({ wch: 16 }, { wch: 14 }, { wch: 14 });
  });
  worksheet['!cols'] = colWidths;

  // 6. Apply Highlight & Cell Styling
  const totalRows = matrixData.length;
  const totalCols = headerRow1.length;

  // Styles
  const headerRow0Style = {
    font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '002060' } }, // Etihad Deep Navy
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  };

  const headerRow1Style = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '1F4E78' } }, // Slate Navy
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  };

  // Title Columns Style (Columns A, B, C: Staff Number, Name, Batch)
  const titleColumnStyle = {
    font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0A192F' } },
    fill: { fgColor: { rgb: 'E2E8F0' } }, // Soft Slate Grey Highlight
    alignment: { horizontal: 'left', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'CBD5E1' } },
      bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
      left: { style: 'thin', color: { rgb: 'CBD5E1' } },
      right: { style: 'thin', color: { rgb: 'CBD5E1' } },
    },
  };

  const standardDataStyle = {
    font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: 'E2E8F0' } },
      bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
      left: { style: 'thin', color: { rgb: 'E2E8F0' } },
      right: { style: 'thin', color: { rgb: 'E2E8F0' } },
    },
  };

  const getStatusStyle = (statusStr: string) => {
    let fgColor = 'FFFFFF';
    let fontColor = '000000';

    if (statusStr === 'Present') {
      fgColor = 'E2EFDA'; // Light Green
      fontColor = '375623';
    } else if (statusStr === 'Late to Work') {
      fgColor = 'FFF2CC'; // Light Amber
      fontColor = 'B25900';
    } else if (statusStr === 'No Show') {
      fgColor = 'FCE4D6'; // Light Red
      fontColor = 'C00000';
    } else if (['Annual Leave', 'Sick Leave', 'Military Services', 'Training', 'Stand Down'].includes(statusStr)) {
      fgColor = 'D9E1F2'; // Light Blue/Purple accent
      fontColor = '1F4E78';
    } else if (statusStr === 'Weekend') {
      fgColor = 'F2F2F2'; // Light Grey
      fontColor = '595959';
    }

    return {
      font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: fontColor } },
      fill: { fgColor: { rgb: fgColor } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
        left: { style: 'thin', color: { rgb: 'E2E8F0' } },
        right: { style: 'thin', color: { rgb: 'E2E8F0' } },
      },
    };
  };

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { v: '', t: 's' };
      }

      if (r === 0) {
        worksheet[cellRef].s = headerRow0Style;
      } else if (r === 1) {
        worksheet[cellRef].s = headerRow1Style;
      } else if (c < 3) {
        // Highlighted Title Columns: Staff Number, Name, Batch
        worksheet[cellRef].s = {
          ...titleColumnStyle,
          alignment: c === 1 ? { horizontal: 'left', vertical: 'center' } : { horizontal: 'center', vertical: 'center' },
        };
      } else {
        // Date Columns (Status, Login Time, Sign Out Time)
        const subColIndex = (c - 3) % 3;
        if (subColIndex === 0) {
          // Status cell
          const cellVal = String(worksheet[cellRef].v || '');
          worksheet[cellRef].s = getStatusStyle(cellVal);
        } else {
          // Login Time or Sign Out Time
          worksheet[cellRef].s = standardDataStyle;
        }
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');

  // File Name
  const fileNameBatch = batchName === 'All' ? 'All_Batches' : batchName.replace(/\s+/g, '_');
  const filename = `Etihad_OJE_Attendance_${fileNameBatch}_${startDate}_to_${endDate}.xlsx`;

  XLSX.writeFile(workbook, filename);
}
