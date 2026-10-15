// Use the installed compiler without tsx's OS-account/temp-directory lookup.
// Application production code is still compiled by Next.js, unchanged.
/* eslint-disable @typescript-eslint/no-require-imports -- This file intentionally registers a CommonJS TypeScript CLI loader. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};
if (require.main === module) {
  if (process.argv[2] === '--test') {
    const files = fs.globSync('tests/*.test.ts');
    const result = spawnSync(
      process.execPath,
      [
        '--no-experimental-strip-types',
        '--require',
        __filename,
        '--test',
        ...process.argv.slice(3),
        ...files,
      ],
      { stdio: 'inherit', env: process.env },
    );
    process.exitCode = result.status ?? 1;
  } else {
    const entry = path.resolve(process.argv[2]);
    process.argv.splice(1, 1);
    require(entry);
  }
}
