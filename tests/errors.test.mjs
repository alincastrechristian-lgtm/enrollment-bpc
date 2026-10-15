import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isHttpError } from '@sveltejs/kit';
import { HttpError, HandledHttpError } from '@sveltejs/kit/internal';

const { outputText } = ts.transpileModule(readFileSync('src/lib/errors.ts', 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
});
const helpers = {};
new Function('require', 'exports', outputText)(() => ({ isHttpError }), helpers);
const { getErrorMessage, getAuthErrorMessage, getPublicError } = helpers;
const secret = 'SECRET database password smtp-token /private/server/path';

test('remote errors preserve expected messages and hide unexpected details', () => {
	for (const Type of [HttpError, HandledHttpError]) {
		for (const status of [400, 401, 403, 404, 409, 429]) {
			assert.equal(
				getErrorMessage(new Type({ status, message: 'Public validation' }), 'Fallback'),
				'Public validation'
			);
		}
		for (const status of [500, 502, 503]) {
			assert.equal(getErrorMessage(new Type({ status, message: secret }), 'Fallback'), 'Fallback');
		}
		for (const message of ['', ' ', 123, null]) {
			assert.equal(getErrorMessage(new Type({ status: 400, message }), 'Fallback'), 'Fallback');
		}
	}
	for (const cause of [
		new Error(secret),
		{ message: secret },
		{ status: 400, message: secret },
		secret,
		null,
		undefined
	]) {
		assert.equal(getErrorMessage(cause, 'Fallback'), 'Fallback');
	}
});

test('auth errors translate known codes without exposing provider text', () => {
	assert.equal(
		getAuthErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD', message: secret }, 'Fallback'),
		'Incorrect email or password.'
	);
	assert.equal(
		getAuthErrorMessage({ code: 'PASSWORD_TOO_SHORT', message: secret }, 'Fallback'),
		'Use at least 8 characters for your password.'
	);
	assert.equal(
		getAuthErrorMessage({ status: 429, message: secret }, 'Fallback'),
		'Too many requests. Wait a moment before trying again.'
	);
	for (const cause of [
		null,
		new Error(secret),
		{ code: 'UNKNOWN', message: secret },
		{ code: 'toString' },
		{ status: 500, code: 'INVALID_EMAIL', message: secret }
	]) {
		assert.equal(getAuthErrorMessage(cause, 'Fallback'), 'Fallback');
	}
});

test('page hooks preserve public statuses and sanitize unknown, validation and server errors', () => {
	for (const kind of ['app', 'framework']) {
		assert.deepEqual(getPublicError({ kind, error: { status: 409, message: 'Record changed' } }), {
			status: 409,
			message: 'Record changed'
		});
		assert.deepEqual(getPublicError({ kind, error: { status: 503, message: secret } }), {
			status: 503,
			message: 'Something went wrong. Please try again.'
		});
	}
	assert.deepEqual(
		getPublicError({
			kind: 'validation',
			error: { status: 400, message: secret },
			issues: [{ message: secret }]
		}),
		{ status: 400, message: 'Check your input and try again.' }
	);
	assert.deepEqual(getPublicError({ kind: 'unknown', error: new Error(secret) }), {
		status: 500,
		message: 'Something went wrong. Please try again.'
	});
});
