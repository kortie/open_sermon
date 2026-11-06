// Encrypted local backup (DESIGN 3.11, 4.2, S06). No network: the user saves and moves the file.
export { BACKUP_EXTENSION, BackupError, type BackupErrorCode } from './format';
export { MIN_PASSWORD_LENGTH, PBKDF2_ITERATIONS } from './kdf';
export { backupFileName, checkBackupPassword, countProviderKeys, exportBackup, type ExportOptions, type PasswordProblem } from './export';
export { importBackup, inspectBackup, type BackupInfo, type ConflictPolicy, type ImportOptions, type ImportReport } from './import';
