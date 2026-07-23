# Task 4: Worker Protocol, Request Authority, And Bounded Cache

Status: implementation complete; pending review.

## Scope

Added the module-worker adapter and reusable render coordinator around the existing
pure `applyVariationLook` byte authority. This task adds no React, canvas, object
URL, project persistence, or UI integration.

## TDD Evidence

### Initial RED

Command before either production module existed:

```text
npx tsx --test tests/editor-look-render-coordinator.test.ts
```

Result: exit 1, 0 passed, 1 failed. Node reported `ERR_MODULE_NOT_FOUND` for
`editor/lookRenderCoordinator`, which was the expected missing-production-module
failure.

### Initial GREEN

Command after the first implementation:

```text
npx tsx --test tests/editor-look-render-coordinator.test.ts
```

Result: exit 0, 14 passed, 0 failed. This covered stale success and failure,
surface independence, input and cache ownership, transfer lists, cache hits,
exact LRU eviction, oversize bypass, variation eviction, retry, clear, crash
fan-out, malformed messages, disposal, browser-worker construction, and the
module-worker handler.

### Self-Review RED

Self-review found that a failed `Map.set` during LRU read promotion could leave
phantom bytes after the entry had already been removed. A regression forced that
cache allocation path before the accounting fix:

```text
npx tsx --test --test-name-pattern "cache promotion failure" tests/editor-look-render-coordinator.test.ts
```

Result: exit 1, 0 passed, 1 failed. The retained-entry assertion reported
`4 !== 3` worker posts, proving the phantom count caused an incorrect eviction.

After recalculating bytes from entries that actually survived the failed
promotion, the same command exited 0 with 1 passed and 0 failed.

### Final Focused GREEN

Exact final focused command:

```text
npx tsx --test tests/editor-look-render-coordinator.test.ts tests/editor-look-processor.test.ts
```

Result: exit 0, 26 passed, 0 failed, 0 cancelled, 0 skipped, and 0 todo. This is
15 coordinator/worker tests plus the 11 existing pure-processor tests.

## Additional Verification

```text
npm run typecheck
```

Result: exit 0; `tsc --noEmit` reported no diagnostics.

```text
npm run build
```

Result: exit 0; Vite 8.0.16 transformed 1,804 modules and completed the production
build in 2.66 seconds.

```text
git diff --check
```

Result: exit 0 with no whitespace errors. Git emitted only the repository's
existing LF-to-CRLF working-copy warnings. No broad verify command was run.

## Implementation

- `LookRenderCoordinator` assigns monotonic request IDs and keeps authority per
  surface. Replacing or clearing a pending surface resolves it as stale
  immediately; later messages no longer have a pending entry they can mutate.
- Successful responses are accepted only when request ID, render key, surface
  authority, dimensions, and exact RGBA buffer length all match. Current malformed
  responses become the stable failure outcome; stale or wrong-key responses are
  ignored.
- Caller input is cloned into coordinator ownership, then cloned again for the
  outbound transfer. Failed current requests retain only that owned input for
  retry. Cache reads and writes each make an independent pixel clone.
- The cache uses `Map` insertion order for exact LRU behavior and counts only
  `Uint8ClampedArray.byteLength`. Its default budget is `64 * 1024 * 1024` bytes.
  Oversize entries and clone/write failures bypass caching without changing a
  computed ready outcome. Failed read promotion reconciles byte accounting from
  surviving entries.
- `evictVariation` removes an exact variation key and keys beginning with the
  canonical `${variationId}:` prefix without matching longer variation IDs.
- Worker `error` and `messageerror` events fan out the stable failure to every
  currently authoritative pending surface. Each surface retains its own retry
  input and key.
- `dispose()` is idempotent. It resolves pending work stale, clears pending,
  surface, retry, and cache ownership, removes all three listeners, and terminates
  the worker once.
- The module worker validates correlation fields, dimensions, exact byte length,
  exact envelope keys, and an already-normalized `VariationLook`. It invokes only
  `applyVariationLook`, transfers the result buffer, catches all failures, posts
  only `Look preview failed.`, and performs no logging.

## Files

- `editor/lookRenderCoordinator.ts`: public protocol, worker-like adapter,
  per-surface request authority, retry lifecycle, clone-safe bounded LRU, cleanup,
  and `createBrowserLookWorker`.
- `editor/lookWorker.ts`: validated module-worker request handler and transferable
  result/failure envelopes.
- `tests/editor-look-render-coordinator.test.ts`: 15 coordinator and worker tests.
- `.superpowers/sdd/progress.md`: Task 4 marked implementation complete and pending
  review.
- `.superpowers/sdd/task-4-report.md`: this report.

## Self-Review

- New renders and `clearSurface` settle only the affected pending surface stale.
  The pending lookup is removed before any obsolete worker response can reach
  cache or retry state. Other surfaces remain authoritative.
- Success and failure handlers verify both request ID and render key against the
  current surface authority before mutation. Stale success cannot cache and stale
  failure cannot replace a newer retry input or settle a newer promise.
- The fake worker uses real structured-clone transfer semantics, proving the
  transferred coordinator copy detaches while caller bytes remain intact. Mutating
  ready and cache-hit outputs does not change later hits.
- LRU tests lock exact byte accounting, read promotion, eviction order, oversize
  bypass, exact variation-prefix behavior, and recovery from simulated cache
  promotion allocation failure.
- Retry posts only the current failed render key and coordinator-owned bytes.
  Clearing a pending or failed surface removes all retry authority.
- Crash fan-out, current malformed responses, wrong-key messages, outbound and
  return transfer lists, listener removal, stale disposal outcomes, and one-time
  termination are covered directly.
- The worker test exercises a valid processed response and an invalid envelope,
  checks the exact stable failure object, and intercepts all common console methods
  to verify no user data is logged.
- No React, canvas, UI, object URL, persistence, or unrelated module changes were
  introduced. Self-review found no remaining Task 4 contract defect.

## Concerns

Task 5 must construct canonical render keys with the documented
`${variationId}:...` prefix so variation eviction remains exact. Because Task 5
owns the first production import and UI integration, the current application entry
does not yet retain a worker chunk in Vite output; the module-worker URL and handler
are covered directly here. No known concern remains within Task 4 scope.

Commit subject: `feat: process Looks in a bounded preview worker`.

## Fix Review

### Findings Addressed

1. Cache hits, caller-frame clone failures, and synchronous `postMessage`
   failures now create a normal per-surface pending record before their outcome is
   known. Their ready or failed settlement is deferred by one microtask and
   rechecks request ID plus render key authority. A same-stack replacement,
   `clearSurface`, or `dispose` can therefore settle the original promise stale
   before the deferred callback runs.
2. Cache read cloning and LRU promotion are separate operations. If the RGBA clone
   succeeds but reinsertion fails, the coordinator drops the damaged cache entry,
   recalculates exact bytes from surviving entries, and returns the valid clone
   without posting another worker request.
3. Messages without a valid request ID and render key correlation are ignored.
   A malformed message with a current correlated ID/key still fails only that
   request with the stable message. Only worker `error` and `messageerror` events
   fan out failure across current pending surfaces.

### Fix RED Evidence

The review regressions were added before production changes and run with the
required focused command:

```text
npx tsx --test tests/editor-look-render-coordinator.test.ts tests/editor-look-processor.test.ts
```

Result: exit 1, 32 tests, 25 passed, 7 failed, 0 cancelled, 0 skipped, and
0 todo. The seven failures were exactly:

- cache hit followed in the same stack by replacement returned ready instead of
  stale;
- cache hit followed by `clearSurface` returned ready instead of stale;
- cache hit followed by `dispose` returned ready instead of stale;
- frame clone failure followed by clear returned failed instead of stale;
- synchronous `postMessage` failure followed by replacement returned failed
  instead of stale;
- failed cache promotion posted a third worker request instead of staying at two;
- an uncorrelated malformed message settled both current surfaces instead of
  leaving them pending.

### Fix GREEN Evidence

Exact final focused command:

```text
npx tsx --test tests/editor-look-render-coordinator.test.ts tests/editor-look-processor.test.ts
```

Result: exit 0, 32 passed, 0 failed, 0 cancelled, 0 skipped, and 0 todo. This is
21 coordinator/worker tests plus all 11 existing pure-processor tests.

Required typecheck:

```text
npm run typecheck
```

Result: exit 0; `tsc --noEmit` reported no diagnostics.

Required production build:

```text
npm run build
```

Result: exit 0; Vite 8.0.16 transformed 1,804 modules and completed the build in
2.34 seconds.

Required whitespace check:

```text
git diff --check
```

Result: exit 0 with no whitespace errors. Git emitted only the repository's
existing LF-to-CRLF working-copy warnings. No broad verify command was run.

### Fix Files

- `editor/lookRenderCoordinator.ts`: tracked deferred immediate outcomes, optional
  retry input for clone failures, valid-clone cache fallback, and uncorrelated
  message ignore behavior.
- `tests/editor-look-render-coordinator.test.ts`: same-stack cache-hit authority,
  clone/post failure ordering, no-recompute promotion failure, and independent
  malformed-message regressions.
- `.superpowers/sdd/task-4-report.md`: this Fix Review evidence.

### Fix Self-Review

- Every active render now has one entry in the request-ID pending map before cache
  lookup, input cloning, or posting. `releaseSurface` and `dispose` can settle all
  three immediate paths stale through the same mechanism as worker-backed work.
- Deferred ready and failed callbacks call authority-checked handlers. Once a
  replacement, clear, or disposal removes authority, those callbacks cannot cache,
  install retry input, or alter the already-stale promise.
- Synchronous transport failure retains the coordinator-owned frame only while it
  remains current. Replacement and clear remove that retry authority before the
  failure microtask runs.
- A failed LRU reinsertion cannot invalidate an already-created frame clone. The
  failed key is removed, surviving entry byte lengths are summed again, and no
  worker recomputation occurs.
- Invalid or missing correlation is ignored before pending lookup. Correctly
  correlated malformed payloads still produce stable per-request failure, while
  explicit worker faults retain their tested two-surface fan-out behavior.
- Existing stale success/failure isolation, independent surfaces, transfer lists,
  caller/cache cloning, exact LRU order and byte accounting, exact variation-prefix
  eviction, retry, clear, crash, disposal, worker validation, stable errors, and
  no-logging coverage all remain green.
- No React, canvas, UI, object URL, persistence, or unrelated production module
  was changed. Self-review found no remaining issue from the three findings.

### Fix Concerns

Task 5 owns the first production import of `createBrowserLookWorker` and will
verify that Vite emits the actual module-worker chunk. This Task 4 build verifies
the current application graph without adding a build-only import. No known concern
remains within the reviewed Task 4 scope.

Fix commit subject: `fix: preserve Look render request authority`.
