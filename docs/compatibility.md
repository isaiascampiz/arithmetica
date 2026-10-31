# Naming and compatibility

**Arithmetica** is the product identity; **arithmetica** is the package and repository name. New UI modules use feature folders and descriptive names without release prefixes. `src/lib/brand.ts` owns application display constants; static PWA assets keep matching names.

Some historical names deliberately remain because changing them would alter a stored or external contract:

| Identifier                                                                             | Reason to preserve it                                                                         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `data/demo-v1.json`                                                                    | Renaming the default could silently initialize a second database                              |
| `model.ts`, `v2-*`, `v3-*` domain modules                                              | Explicit persisted schema and command versions, with regression coverage                      |
| Existing SQL migration filenames and contents                                          | Applied migration history and restore compatibility                                           |
| `centerflow_states`, `centerflow_state_history`, `read_centerflow`, `write_centerflow` | Existing PostgreSQL/RPC contracts used by deployed adapters and recovery                      |
| `CF-` pouch labels                                                                     | Previously printed physical labels must continue to scan; new labels use `AR-`                |
| `centerflow-pending-roster`                                                            | Previously prepared private intake artifacts remain readable alongside the Arithmetica format |
| Existing cookie and `cf-*` preference keys                                             | Preserve sessions and non-record device preferences                                           |
| Old service-worker cache prefixes                                                      | Activation removes earlier shells rather than leaving stale caches                            |
| `CENTERFLOW_E2E_*`, `CENTERFLOW_BUILD`                                                 | Existing development environments retain supported aliases                                    |
| `v2.css`, `v3.css`, versioned CSS selectors                                            | Preserve the ordered cascade and earlier interface contracts                                  |
| Historical documents and regression fixtures                                           | Accurate evidence of earlier versions, not current product branding                           |

Use `ARITHMETICA_E2E_PORT`, `ARITHMETICA_E2E_DATA_PATH`, and `ARITHMETICA_E2E_OUTPUT_DIR` for new test configuration; they take precedence over their old aliases. New build scripts set `ARITHMETICA_BUILD`. New local backup filenames use `arithmetica-`; existing backups are unchanged.

Do not run global replacements over operational records or migrations. A future storage rename requires an explicit additive migration, backups, and compatibility tests. The checkout folder can have any name; no application path depends on the old directory name.
