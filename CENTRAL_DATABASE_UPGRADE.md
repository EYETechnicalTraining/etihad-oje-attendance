# Central Database Architecture & Migration Guide

This document explains how to upgrade the **Etihad Engineering Technical Training – OJE Trainee Management System** from device-local IndexedDB storage (`Dexie.js`) to a central multi-user cloud or enterprise database (e.g., PostgreSQL, Node.js / Express REST API, Supabase, or Firebase) **without changing any React UI components**.

---

## 🏗 Architectural Abstraction Layer

The application is built with a decoupled Data Access Layer (DAL). All UI components interact exclusively with abstract TypeScript service interfaces defined in [`src/services/api/index.ts`](./src/services/api/index.ts):

- `IAuthService`
- `ITraineeService`
- `IAttendanceService`
- `IAllocationService`
- `ITaskService`
- `IAuditService`
- `IBackupService`

Currently, these interfaces are implemented by Dexie.js local database wrappers located in [`src/services/dexie/`](./src/services/dexie/).

```
+-------------------------------------------------------------+
|                      React UI Layer                         |
|   (AdminDashboard, TraineeDashboard, Modals, Forms, Tables) |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|               Data Access Layer Interface                   |
|              (src/services/api/index.ts)                   |
+-------------------------------------------------------------+
            /                                     \
           v                                       v
+------------------------+             +------------------------+
| Current: Dexie.js      |             | Upgraded: Central API  |
| IndexedDB Provider     |             | REST/GraphQL Provider  |
| (src/services/dexie/)  |             | (src/services/http/)   |
+------------------------+             +------------------------+
```

---

## 🛢 Central Database Relational Schema (PostgreSQL Example)

To host a shared central database, create the following SQL tables:

```sql
-- 1. Batches Table
CREATE TABLE batches (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2. Trainees Table
CREATE TABLE trainees (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    batch_name VARCHAR(100) REFERENCES batches(name),
    program VARCHAR(150) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 3. Users Table (Authentication)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('MASTER', 'TRAINEE')),
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    active BOOLEAN DEFAULT TRUE,
    force_password_change BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    last_password_change DATE
);

-- 4. Attendance Table
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    date DATE NOT NULL,
    login_time VARCHAR(20) NOT NULL,
    status VARCHAR(30) CHECK (status IN ('Present', 'Late to Work', 'No Show')),
    authentication_method VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_trainee_date_attendance UNIQUE (trainee_id, date)
);

-- 5. Allocations Table
CREATE TABLE allocations (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    location VARCHAR(150) NOT NULL,
    inside_outside VARCHAR(20) CHECK (inside_outside IN ('Inside', 'Outside')),
    aircraft_registration VARCHAR(50) NOT NULL,
    aircraft_type VARCHAR(50) NOT NULL,
    manager VARCHAR(150) NOT NULL,
    engineer VARCHAR(150) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL
);

-- 6. Task Counts Table
CREATE TABLE task_counts (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    task_count INT NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL
);

-- 7. Daily Sign-Outs Table
CREATE TABLE sign_outs (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    date DATE NOT NULL,
    sign_out_time VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL,
    CONSTRAINT unique_trainee_date_signout UNIQUE (trainee_id, date)
);

-- 8. Remarks Table
CREATE TABLE remarks (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    remark TEXT NOT NULL,
    created_by VARCHAR(150) NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL
);

-- 9. Passkey Credentials Table
CREATE TABLE passkey_credentials (
    id SERIAL PRIMARY KEY,
    trainee_id VARCHAR(50) REFERENCES trainees(trainee_id),
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter INT DEFAULT 1,
    device_name VARCHAR(100) NOT NULL,
    created_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 10. Audit Logs Table
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(150) NOT NULL,
    action TEXT NOT NULL,
    date DATE NOT NULL,
    time VARCHAR(20) NOT NULL,
    related_trainee VARCHAR(50),
    timestamp BIGINT NOT NULL
);
```

---

## 🔌 Steps to Swap from IndexedDB to Central HTTP API

1. **Create an HTTP Service Implementation**:
   Create `src/services/http/httpAttendanceService.ts` implementing `IAttendanceService`:

   ```typescript
   import { IAttendanceService } from '../api';
   import { Attendance, TraineeLogSummary } from '../../types';

   export class HttpAttendanceService implements IAttendanceService {
     private baseUrl = 'https://api.etihad.ae/oje/v1';

     async logAttendance(traineeId: string, authMethod: string) {
       const response = await fetch(`${this.baseUrl}/attendance`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ traineeId, authMethod }),
       });
       return await response.json();
     }

     async getTraineeLogsForDate(date: string): Promise<TraineeLogSummary[]> {
       const response = await fetch(`${this.baseUrl}/attendance/logs?date=${date}`);
       return await response.json();
     }

     // ... implement remaining interface methods
   }
   ```

2. **Update Service Exports**:
   In `src/services/dexie/attendanceService.ts` (or an index service container), replace the exported instance:

   ```typescript
   // Switch from:
   // export const attendanceService = new DexieAttendanceService();

   // To:
   export const attendanceService = new HttpAttendanceService();
   ```

3. **Zero UI Code Changes Required**:
   All UI components (`TraineeLogsTab`, `TraineeDashboard`, `AttendanceModal`, etc.) consume `attendanceService` through the `IAttendanceService` interface and will function with central real-time database sync immediately.
