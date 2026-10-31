# Security and privacy

Do not report credentials, student information, private screenshots, or exploitable details in public issues. Use the repository's private vulnerability reporting feature to contact the owner securely.

Development uses fictional fixtures. Production requires separate organizational/privacy authorization and validated authentication, permissions, hosting, and recovery configuration. The public source repository is not a student-record backup.

Server-side membership and role checks protect staff APIs. The shared kiosk receives only restricted attendance responses. Authenticated records must never enter browser storage or service-worker caches. Keep operational secrets and records in approved private storage, outside Git.

`pnpm repo:check --history` checks tracked/publishable files and locally reachable history for disallowed paths and common credential patterns. It does not prove that every possible secret or personal detail is absent. Review newly added documents and images, and scan configured credential values before making an operational repository public. Historical commits, branches, tags, issues, and attachments must also be considered.
