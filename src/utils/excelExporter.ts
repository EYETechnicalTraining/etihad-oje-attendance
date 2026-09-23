import XLSX from 'xlsx-js-style';
import { Trainee, Batch } from '../types';
import { traineeService } from '../services/hybridTraineeService';
import { attendanceService } from '../services/hybridAttendanceService';
import { taskService } from '../services/hybridTaskService';
import { holidayService } from '../services/hybridHolidayService';
import {
  getDatesInRange,
  formatDisplayDate,
  isWeekend,
  getUAEDateString,
  isPastCutoffTime,
} from './timezone';

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

  // Sort trainees by ID numerically
  trainees.sort((a, b) => a.traineeId.localeCompare(b.traineeId, undefined, { numeric: true }));

  // 2. Dates in range & System Context
  const dates = getDatesInRange(startDate, endDate);
  const today = getUAEDateString();
  const past8AM = isPastCutoffTime(today);

  // Fetch holidays for accurate status
  const holidays = await holidayService.getAllHolidays();
  const holidayMap = new Map<string, string>();
  holidays.forEach((h) => holidayMap.set(h.date, h.name));

  // 3. Build Headers
  const headerRow1: string[] = ['Staff Number', 'Name', 'Batch'];
  const headerRow2: string[] = ['', '', ''];

  dates.forEach((dateStr) => {
    const isWknd = isWeekend(dateStr);
    const isHol = holidayMap.has(dateStr);

    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formattedDate = formatDisplayDate(dateStr, false); // "23 September 2026"
    const dayOfWeek = dateObj.toLocaleDateString('en-GB', { weekday: 'long' }); // "Wednesday"

    let dateTitle = `${formattedDate} (${dayOfWeek})`;
    if (isWknd) {
      dateTitle = `${formattedDate} (${dayOfWeek} - Weekend)`;
    } else if (isHol) {
      const holName = holidayMap.get(dateStr);
      dateTitle = holName
        ? `${formattedDate} (${dayOfWeek} - ${holName})`
        : `${formattedDate} (${dayOfWeek} - Holiday)`;
    }

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
      const isHol = holidayMap.has(dateStr);
      const isFuture = dateStr > today;
      const isTodayPending = dateStr === today && !past8AM;

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
      } else if (isHol) {
        status = 'Holiday';
      } else if (isFuture || isTodayPending) {
        // Future days or today before 8:00 AM show "Pending" instead of "No Show"
        status = 'Pending';
      } else {
        status = 'No Show';
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
    colWidths.push({ wch: 16 }, { wch: 15 }, { wch: 15 });
  });
  worksheet['!cols'] = colWidths;

  // 6. Professional Border and Style Computation
  const totalRows = matrixData.length;
  const totalCols = headerRow1.length;

  const BORDER_COLOR_THICK = { rgb: '002060' }; // Dark Etihad Navy for date blocks and outer frame
  const BORDER_COLOR_THIN = { rgb: 'CBD5E1' };  // Slate 300 for neat cell grid lines

  /**
   * Computes precise borders for each cell:
   * - Thin border for each row (top and bottom)
   * - Thick (medium) border for each column (Staff Number, Name, Batch, and each Date block)
   * - Thin border between the 3 sub-columns inside each date block
   */
  function computeCellBorder(r: number, c: number) {
    // 1. Horizontal borders (row grid)
    let topStyle = 'thin';
    let topColor = BORDER_COLOR_THIN;
    let bottomStyle = 'thin';
    let bottomColor = BORDER_COLOR_THIN;

    if (r === 0) {
      topStyle = 'medium';
      topColor = BORDER_COLOR_THICK;
    }
    if (r === 1) {
      // Bottom of the 2-row header block separating headers from data rows
      bottomStyle = 'medium';
      bottomColor = BORDER_COLOR_THICK;
    }
    if (r === totalRows - 1) {
      // Bottom of the last data row
      bottomStyle = 'medium';
      bottomColor = BORDER_COLOR_THICK;
    }

    // 2. Vertical borders (thick border for each column, thin inside sub-columns)
    let leftStyle = 'thin';
    let leftColor = BORDER_COLOR_THIN;
    let rightStyle = 'thin';
    let rightColor = BORDER_COLOR_THIN;

    if (c === 0) {
      // Column 0: Staff Number
      leftStyle = 'medium';
      leftColor = BORDER_COLOR_THICK;
      rightStyle = 'medium';
      rightColor = BORDER_COLOR_THICK;
    } else if (c === 1) {
      // Column 1: Name
      leftStyle = 'medium';
      leftColor = BORDER_COLOR_THICK;
      rightStyle = 'medium';
      rightColor = BORDER_COLOR_THICK;
    } else if (c === 2) {
      // Column 2: Batch
      leftStyle = 'medium';
      leftColor = BORDER_COLOR_THICK;
      rightStyle = 'medium';
      rightColor = BORDER_COLOR_THICK;
    } else {
      // Date Columns: treated as a single column containing 3 sub-columns
      const subCol = (c - 3) % 3;
      if (subCol === 0) {
        // Outer left boundary of Date column (Status)
        leftStyle = 'medium';
        leftColor = BORDER_COLOR_THICK;
        rightStyle = 'thin';
        rightColor = BORDER_COLOR_THIN;
      } else if (subCol === 1) {
        // Inner divider (Log In Time) - thin on both sides
        leftStyle = 'thin';
        leftColor = BORDER_COLOR_THIN;
        rightStyle = 'thin';
        rightColor = BORDER_COLOR_THIN;
      } else if (subCol === 2) {
        // Outer right boundary of Date column (Sign Out Time)
        leftStyle = 'thin';
        leftColor = BORDER_COLOR_THIN;
        rightStyle = 'medium';
        rightColor = BORDER_COLOR_THICK;
      }
    }

    return {
      top: { style: topStyle, color: topColor },
      bottom: { style: bottomStyle, color: bottomColor },
      left: { style: leftStyle, color: leftColor },
      right: { style: rightStyle, color: rightColor },
    };
  }

  const getStatusStyle = (statusStr: string, border: any) => {
    let fgColor = 'FFFFFF';
    let fontColor = '000000';

    if (statusStr === 'Present') {
      fgColor = 'E2EFDA'; // Light Green
      fontColor = '276A3C';
    } else if (statusStr === 'Late to Work') {
      fgColor = 'FFF2CC'; // Light Amber
      fontColor = 'B45309';
    } else if (statusStr === 'No Show') {
      fgColor = 'FCE4D6'; // Light Red
      fontColor = 'B91C1C';
    } else if (statusStr === 'Pending') {
      fgColor = 'F8FAFC'; // Soft Slate Grey
      fontColor = '64748B'; // Muted Slate
    } else if (statusStr === 'Holiday') {
      fgColor = 'FDF2F8'; // Light Pink
      fontColor = 'BE185D'; // Dark Pink/Magenta
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
      border,
    };
  };

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      if (!worksheet[cellRef]) {
        worksheet[cellRef] = { v: '', t: 's' };
      }

      const cellBorder = computeCellBorder(r, c);

      if (r === 0) {
        worksheet[cellRef].s = {
          font: { name: 'Calibri', sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '002060' } }, // Deep Etihad Navy
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: cellBorder,
        };
      } else if (r === 1) {
        worksheet[cellRef].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1F4E78' } }, // Slate Navy
          alignment: { horizontal: 'center', vertical: 'center' },
          border: cellBorder,
        };
      } else if (c < 3) {
        // Title Columns: Staff Number, Name, Batch
        worksheet[cellRef].s = {
          font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: '0A192F' } },
          fill: { fgColor: { rgb: 'F1F5F9' } },
          alignment: c === 1 ? { horizontal: 'left', vertical: 'center' } : { horizontal: 'center', vertical: 'center' },
          border: cellBorder,
        };
      } else {
        // Date Columns (Status, Login Time, Sign Out Time)
        const subColIndex = (c - 3) % 3;
        if (subColIndex === 0) {
          // Status cell
          const cellVal = String(worksheet[cellRef].v || '');
          worksheet[cellRef].s = getStatusStyle(cellVal, cellBorder);
        } else {
          // Login Time or Sign Out Time
          worksheet[cellRef].s = {
            font: { name: 'Calibri', sz: 10, color: { rgb: '1E293B' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: cellBorder,
          };
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
