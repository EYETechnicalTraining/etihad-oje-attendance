# Etihad Engineering Technical Training – OJE Trainee Management System (PWA)

A mobile-responsive Progressive Web Application (PWA) designed for **Etihad Engineering Technical Training – OJE (On-the-Job Experience) Trainee Management**.

This application is tailored for mobile phone access by trainees on active aircraft maintenance duties and desktop access by the Technical Training Program Manager.

---

## ✈️ Key Features

- **Master Administrative Dashboard**:
  - **Trainee Directory & Batch Management**: Create, filter, search, and sort batches (`Batch 1`, `Batch 2`, `OJE Batch 5`) and trainee profiles.
  - **Access Control & Credentials**: Automatic default password generation (`Etihad@[Trainee ID]`), password reset capabilities, account activation toggles, and passkey registration tracking.
  - **Trainee Logs**: Real-time date navigation with UAE time (`Asia/Dubai`), automated status calculation (`PRESENT`, `LATE TO WORK`, `NO SHOW`), Workstation Allocation history, Daily Task Count tracking, and Sign-Out records.
  - **Data Backup & CSV Reporting**: Complete IndexedDB JSON database export/import and CSV spreadsheet downloads.
  - **System Audit Log**: Full audit trail of administrative and trainee actions.

- **Mobile-First Trainee Dashboard**:
  - **Device Biometric Passkey Registration**: Secure device authentication using standard WebAuthn (Fingerprint, Face ID, Device PIN).
  - **Supervisor Remarks**: Real-time access to remarks and evaluations saved by Managers and Engineers.
  - **Attendance Logging**: One-click timestamp verification with automated attendance status determination.
  - **Workstation Allocation Form**: Hangar, Location, Inside/Outside, Aircraft Registration, Aircraft Type, Manager & Engineer recording.
  - **Daily Task Count**: Numeric task logging with historical tracking.
  - **Daily Sign-Out**: End-of-day sign-out verification.

---

## 🔒 Security & Initial Master Credentials

### Initial Master Account
- **Username**: `selva.master`
- **Password**: `Aviation@6996504++`

> [!IMPORTANT]
> **Client-Side Security Limitation**:
> Because this deployment runs as a static Progressive Web Application hosted on GitHub Pages, data persistence relies on client-side IndexedDB (`Dexie.js`).
> Passwords in IndexedDB are stored as **SHA-256 cryptographic hashes**. However, as a static client-only application without a secure server environment, master initial credentials are isolated in seed configuration for demonstration. For production deployment across multiple devices, refer to [CENTRAL_DATABASE_UPGRADE.md](./CENTRAL_DATABASE_UPGRADE.md).

---

## 💻 Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18+ or 20+ recommended)
- `npm` (Package Manager included with Node.js)

### Execution Steps
1. Open terminal in the project directory:
   ```bash
   cd "D:\Attendence Portal"
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Launch local Vite development server:
   ```bash
   npm run dev
   ```
4. Open the displayed local URL in your browser (typically `http://localhost:3000`).

---

## 🚀 Building & Deploying to GitHub Pages

### Manual Build
To build production static assets:
```bash
npm run build
```
The output files will be generated in the `dist/` directory.

### Deploying via GitHub Actions (Automated)
1. Initialize Git repository and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of Etihad Engineering OJE Trainee Management PWA"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
   git push -u origin main
   ```
2. In your GitHub repository settings:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. The included workflow `.github/workflows/deploy.yml` will automatically build and publish the app to `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/`.

---

## 📱 PWA Installation on Mobile

### iOS Safari (iPhone)
1. Open the deployed application URL in **Safari**.
2. Tap the **Share** icon at the bottom toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Launch the application directly from your home screen as a native standalone PWA.

### Android Chrome
1. Open the application URL in **Google Chrome**.
2. Tap the top-right **menu (3 dots)**.
3. Select **Add to Home Screen** or **Install App**.
4. Confirm installation.

---

## 🛠 Central Database Upgrade Guide

To transition this application from device-local IndexedDB storage to a multi-device centralized cloud database (e.g. Node/Express, PostgreSQL, Supabase, Firebase), read the detailed architectural guide in [CENTRAL_DATABASE_UPGRADE.md](./CENTRAL_DATABASE_UPGRADE.md).
