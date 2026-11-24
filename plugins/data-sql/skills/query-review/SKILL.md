---
name: query-review
description: Review SQL queries and indexes for correctness and performance - read the query plan (EXPLAIN ANALYZE on production-like data), find missing or redundant indexes, N+1 patterns, unbounded scans and pagination problems. Use when a query or endpoint is slow, before adding an index, when reviewing repository code, or when the user asks about query plans or indexes.
---

# Review queries and indexes

## 1. Find the real queries

Read the repository or ORM code and write down the SQL it actually sends. For an ORM, enable its query logging locally or use its `toSQL()` / debug output. Look for:
- a query inside a loop (N+1),
- `select *`,
- a missing `limit`,
- `order by` without a unique tiebreaker,
- `like '%x'`,
- a function call on an indexed column (`lower(email) = $1` needs an expression index).

## 2. Read the plan

Run `explain (analyze, buffers)` (PostgreSQL), `explain analyze` (MySQL 8), or the actual execution plan (SQL Server). Run it only against a **local or disposable** database seeded with production-like volume; never against production from a session. Check:
- seq scans on large tables,
- row estimates far from the actual counts (stale statistics),
- sorts spilling to disk,
- nested loops over large inputs.

## 3. Decide on indexes

- An index must serve a query that exists. Name the query it serves.
- Put the equality columns first, then the range or sort column. Use a partial index when the query always filters the same way.
- Remove redundant indexes, for example `(a)` when `(a, b)` exists. Every index slows writes and costs storage.
- Add the index in a migration using the `migration` skill (concurrently).

## 4. Report

For each finding, report:
- the query,
- the evidence (plan lines, timings),
- the change,
- the expected effect.

Say what you could not measure, for example when no production-like data was available.
