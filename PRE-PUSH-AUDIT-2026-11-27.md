# Pre-push audit

Date: 2026-11-27
Scope: all tracked and untracked changes in the worktree, reviewed against `HEAD`.

## Findings

### P2: Cover proxy follows redirects without revalidating the destination

`vite.config.ts` validates the initial cover URL but uses `redirect: 'follow'`. If an untrusted client can reach the development server, a permitted public URL that redirects elsewhere could make the proxy request a destination that was not checked. Restrict redirects or validate each redirect target; avoid exposing the development server to untrusted networks.

### P2: Concurrent loans can exceed book stock

`LoansPage.tsx` checks available stock using client-loaded active-loan data, then `loanService.ts` inserts a loan separately. Concurrent requests can both pass the check for the last copy. Enforce availability atomically in the database, for example with a transaction or RPC that serializes loan creation.

### P2: Loan-loading failures are displayed as empty loan data

`ReportsPage.tsx` and `BookshelfPage.tsx` catch all `LoanService.getLoans()` errors and substitute an empty list. A service failure can therefore look like zero active loans or make all copies appear available. Represent loan-loading errors separately from a successful empty result.

### P2: Jakarta detail HTTP errors can be mistaken for an empty search

In `supabase/functions/book-metadata/index.ts`, non-OK detail responses are skipped without classifying the status. This treats 429 and 5xx responses like missing records; if no other provider succeeds, the function can return `found: false`. Treat 404 as an empty record, record other statuses as provider failures, and continue checking remaining candidate records.

### P2: Worst-case lookup latency is high

The sequential lookup can make up to two Open Library requests, three Google Books requests, a Jakarta search, and five Jakarta detail requests. With each request capped at 10 seconds, the theoretical total is about 110 seconds. Add a total deadline or reduce/parallelize the requests with an appropriate cap.

### P3: Direct ISBN-10 requests can return a 10-digit `isbn13` field

The Edge Function validates ISBN-10 input, but the Open Library and Google Books mapping paths can use the original input as a fallback for `isbn13`. The current app normalizes ISBN-10 to ISBN-13 before invoking the function, so this affects direct ISBN-10 calls to the endpoint. Use the normalized ISBN-13 as the fallback or explicitly restrict the endpoint contract.

### P3: Legacy HTTP 200 errors remain indistinguishable from not-found

The client treats `found: false` without a recognized `errorType` as `not_found`. A previous Edge Function version that returns HTTP 200 with `{ found: false, error: ... }` for provider failures will still appear as not-found. HTTP-status fallback only applies to non-2xx responses. Accurate provider classification requires deploying the new Edge Function response contract.

## Verification

- `npx vitest run`: passed, 15 test files and 114 tests.
- `npm run lint`: passed (`tsc --noEmit`).
- `npm run build`: passed. Vite reports a chunk-size warning for a bundle over 500 kB.
- `git diff --check`: passed.

## Push and deployment note

The `main` branch was synchronized with `origin/main` at review time. After the audit was approved, the changes were pushed to `main`; GitHub CI and the Vercel deployment workflow completed successfully. The Supabase Edge Function was not deployed.
