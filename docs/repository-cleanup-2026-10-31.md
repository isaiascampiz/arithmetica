# Repository cleanup — October 31, 2026

## Scope

Standardized the current product and repository identity as **Arithmetica** / `arithmetica`. Grouped 47 interface/test files into feature folders, removed release prefixes from current component filenames, and renamed the active workspace browser test. Updated direct imports, dynamic imports, route entry points, and generated static-browser entry points.

Added a focused README with a fictional current-interface screenshot, current architecture/development/code guides, contributor/security guidance, compatibility documentation, and a documentation index. Previous README/development/architecture content remains in `docs/history/`. Existing design studies and release evidence are retained.

Applied the repository's Prettier settings consistently, added repeatable formatting and publication checks, standardized source line endings, and added GitHub Actions validation. Formatting enumerates publishable files through Git rather than traversing private runtime directories. Generated Next.js type declarations belong outside source control.

New test/build configuration uses `ARITHMETICA_*`, with supported legacy aliases. New local backups use the Arithmetica prefix. Storage filenames, stored data formats, database identifiers, printed pouch codes, cookies/preferences, existing CSS selectors, and immutable migrations remain compatible. See [compatibility](compatibility.md).

## Publication review

The source/history credential-pattern scan found no findings across 852 existing Git blobs. A separate read-only exact-value check compared 10 configured credentials and 71 private student names against source, generated deployment artifacts, and the same history; no exposed values were found. No credential values or private names were logged.

Previously tracked screenshots predate the operational import. The new README image was inspected and contains clearly labeled fictional fixture students. GitHub inspection found no issues or wiki. Private runtime data, workbooks, exports, backups, and credentials remain ignored. These checks reduce publication risk; they are not a guarantee against every possible private detail.

## Validation

| Check                                         | Result                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                   | Passed                                                                                                                                  |
| `pnpm typecheck`                              | Passed                                                                                                                                  |
| `pnpm format:check`                           | Passed across 307 source files                                                                                                          |
| `pnpm test`                                   | All 272 tests passed                                                                                                                    |
| `pnpm build`                                  | Passed                                                                                                                                  |
| `pnpm cloudflare:build`                       | Static browser and Supabase API bundles passed; no deployment                                                                           |
| `pnpm test:e2e`                               | 121 of 122 passed initially; the remaining keyboard-theme case passed five consecutive runs after the test waited for native menu focus |
| `pnpm repo:check --history`                   | No credential-pattern or private-path findings                                                                                          |
| Exact configured credential/private-name scan | No exposed values                                                                                                                       |
| Local documentation links                     | No broken links                                                                                                                         |

The theme test previously sent keyboard events before the native popover received focus. Its readiness assertion now verifies actual focus before exercising Home/Enter; no timing sleeps or application behavior changes were introduced. GitHub Actions runs the complete browser suite on the published source.

A syntax-tree comparison confirmed unchanged domain/server code across 31 formatted files. Existing SQL migrations have no diff. All automated tests use isolated fictional data. This pass does not deploy application code or modify operational records.
