---
name: backup-restore
description: Plan, automate and test backups and restores for self-hosted data (PostgreSQL, SQL Server, volumes) - schedule, encryption, off-site copies, retention aligned with the data inventory, and a timed restore test with the result recorded. Use when setting up or reviewing backups, before a risky migration or deployment, or when asked whether data can be restored.
---

# Backup and restore

A backup that was never restored is a hope, not a control.

## Plan

- **Targets:** state RPO (data you may lose) and RTO (time to restore) per database with the user. They drive the schedule.
- **PostgreSQL:** `pg_dump --format=custom` nightly for small databases; for point-in-time recovery, WAL archiving with pgBackRest or WAL-G. **SQL Server:** full plus differential and log backups (`BACKUP DATABASE … WITH COMPRESSION, CHECKSUM`).
- **Volumes and files:** restic (or the platform's snapshots) with encryption.
- **Where:** encrypted, off the host, in another account or provider (the 3-2-1 rule). The backup credentials cannot delete backups (immutability or object lock where available).
- **Retention:** follows `docs/compliance/retention-policy.md`. Personal data deleted on request also expires from backups within the stated period; record that period in the retention policy.

## Test the restore

1. Restore the latest backup into a separate, isolated environment, never over production. core's shell guard asks before `pg_restore --clean`.
2. Check it: row counts of the main tables, the latest record's timestamp, and that the application starts against it.
3. Time it and compare it with the RTO.
4. Record the date, the backup used, the duration and the result (in the control map, governance `control-map`). That is the evidence for SOC 2 and ISO 27001 (A.8.13).

Do this at least quarterly, and before a migration that changes or drops data.
