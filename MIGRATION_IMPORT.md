# Centerflow private history import

The owner explicitly authorized publication of the existing Centerflow project and Git history to this private repository and completion of Codex Cloud setup. This temporary transfer contains source only; runtime student records and credentials are excluded. See IMPORT_SECURITY_MANIFEST.json.

Concatenate `.migration/part-*.b64` in filename order and base64-decode into a temporary file outside the repository. Verify bundle SHA256 `337cba147c27cfd7b56e97fe022f5002aaa3c74a87b2785ac25c12a31aef77a5` and byte length 3641994 before `git bundle verify`. Original prepared main: `4a6464669382de28781db24bcb709c7dcda4dab8`; baseline tag: `46162816c6b6b71e11076551b1f4c9e2e88a110b`.

Import original main and tag preserving exact commit IDs. Merge original main with this bootstrap branch using --allow-unrelated-histories, without force-push. Remove only the temporary transfer parts and import documents after verification, in an ordinary commit. Keep application source unchanged. Run the checked-in development setup and full browser tests with fictional data only. Verify 96 demo students restore without overwriting data. Publish the private cloud environment only after actual validation.
