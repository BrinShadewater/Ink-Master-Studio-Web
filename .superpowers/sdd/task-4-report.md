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
