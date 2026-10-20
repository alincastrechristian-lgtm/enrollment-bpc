import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const exports = {};
const { outputText } = ts.transpileModule(readFileSync('src/lib/server/secrets.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
new Function('require', 'exports', outputText)(require, exports);
export const secrets = exports;
export const testEncryptionKey = 'ab'.repeat(32);
export const secretsDependencies = {
	'$app/env/private': { DATA_ENCRYPTION_KEY: testEncryptionKey },
	'./secrets': secrets
};
