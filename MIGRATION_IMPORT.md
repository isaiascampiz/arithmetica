# Centerflow private source import

This repository is receiving the preserved Centerflow V3 Git history. The owner explicitly authorized this private import and Codex Cloud setup. No runtime data, private credentials, dependencies or build output are included.

The original Git bundle is transferred in numbered base64 text parts under `.migration/`. Concatenate those parts in numeric order, base64-decode into a temporary file outside the repository, and verify SHA256 `337cba147c27cfd7b56e97fe022f5002aaa3c74a87b2785ac25c12a31aef77a5` before `git bundle verify`. Original prepared main: `4a6464669382de28781db24bcb709c7dcda4dab8`. Baseline tag `v3.0.0-baseline`: `46162816c6b6b71e11076551b1f4c9e2e88a110b`.

Import the original branch and tag, preserving their commit identities. Merge the original branch into this bootstrap main with unrelated histories allowed; do not force-push. After verification remove this temporary import document and the transfer parts in a normal commit. Keep all application files intact. Then run the checked-in development setup and browser tests using only fictional data, and publish the private cloud environment after actual validation.
