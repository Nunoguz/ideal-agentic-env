---
name: retention-and-erasure
description: Maintain the retention and destruction policy (docs/compliance/retention-policy.md) and implement deletion, anonymisation and erasure across every store. Use for new data with a retention need, deletion or account-closure flows, cleanup jobs, new data stores, or questions about retention periods, right to erasure or soft delete.
argument-hint: "[data category | erasure flow]"
---

# Retention and erasure

A soft delete hides data. It does not delete it. Erasure is complete only when the data is gone, or irreversibly anonymised, in every store that holds it.

## Policy

1. For each data category in the data inventory, add or update a row in the retention schedule: the period, the legal or business reason (marked **to confirm**; legal decides), the trigger that starts the clock, the destruction method and the stores.
2. Do not invent statutory periods. If the user or legal has not given one, write "to confirm" and list it as an open question.

## Implementation

1. **Find every store.** The primary database and its replicas, caches, search indexes, object storage, queues and dead-letter queues, analytics and event streams, logs, backups, local exports, and every processor in the data inventory.
2. **Pick the method per store:**
   - Hard delete.
   - Anonymisation: irreversible, and the person cannot be re-identified even by combining data. Pseudonymisation is not anonymisation.
   - Expiry: TTLs, lifecycle rules, backups that age out within a stated period.
   - Crypto-shredding: destroy a per-subject key.
3. **Periodic destruction.** A scheduled job, bounded and idempotent, runs at least as often as the policy states. The KVKK regulation allows at most six months between runs. Every run writes a destruction record (what, how many, which method, when), and the records are kept for at least three years.
4. **Erasure requests.** One entry point that fans out to every store and processor, and is idempotent and auditable (`privacy.erasure.completed`). KVKK Art. 13 sets 30 days to answer an application. Keep what a legal obligation requires, and record why.
5. **Tests.** For each store, a test proves the data is gone or anonymised after the job or request: query the store, not the API. A test also proves that retained records (for example invoices under a legal obligation) survive.

## Report

Update the policy and the data inventory retention references. List the stores not yet covered as follow-ups. Never mark erasure complete while a store is uncovered.
