import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const filepath = fileURLToPath(
	new URL('../src/routes/user/programs/+page.svelte', import.meta.url)
);
const config = await prettier.resolveConfig(filepath);
const format = (source) => prettier.format(source, { ...config, filepath });

test('inline if/else blocks expand automatically and remain stable', async () => {
	const source =
		'{#if ready}<a href="/">View curriculum</a>{:else}<span>No active curriculum</span>{/if}';
	const output = await format(source);
	assert.equal(
		output,
		'{#if ready}\n\t<a href="/">View curriculum</a>\n{:else}\n\t<span>No active curriculum</span>\n{/if}\n'
	);
	assert.equal(await format(output), output);
});

test('nested conditionals and else-if chains retain their structure', async () => {
	const output = await format(
		'{#if a}{#if b}<span>B</span>{/if}{:else if c}<span>C</span>{:else}<span>D</span>{/if}'
	);
	assert.equal(
		output,
		'{#if a}\n\t{#if b}\n\t\t<span>B</span>\n\t{/if}\n{:else if c}\n\t<span>C</span>\n{:else}\n\t<span>D</span>\n{/if}\n'
	);
	assert.equal(await format(output), output);
});

test('closing blocks separate following expressions, text and elements', async () => {
	for (const following of [
		'{label}',
		'Label',
		'<span>Label</span>',
		'{#if other}<span>Other</span>{/if}'
	]) {
		const output = await format(`<button>{#if busy}<span>Loading</span>{/if}${following}</button>`);
		assert.match(output, /\{\/if\}\n\t(?:\{label\}|Label|<span>Label<\/span>|\{#if other\})/);
		assert.equal(await format(output), output);
	}
});

test('dialog saving expression starts on its own line after formatting', async () => {
	const source = await readFile(
		new URL('../src/routes/user/programs/ProgramDialog.svelte', import.meta.url),
		'utf8'
	);
	const reverted = source.replace(/\{\/if\}\s*(\{busy \? 'Saving\.\.\.')/, '{/if}$1');
	const output = await format(reverted);
	assert.match(
		output,
		/\{\/if\}\n\s+\{busy \? 'Saving\.\.\.' : selectedProgram \? 'Save changes' : 'Create Program'\}/
	);
	assert.equal(await format(output), output);
});

test('each, await, key and snippet bodies expand automatically', async () => {
	for (const source of [
		'{#each rows as row}<span>{row.name}</span>{:else}<span>Empty</span>{/each}',
		'{#await promise}<span>Loading</span>{:then value}<span>{value}</span>{:catch error}<span>{error.message}</span>{/await}',
		'{#key id}<span>{id}</span>{/key}',
		'{#snippet trigger()}<Settings class="size-4" />{/snippet}'
	]) {
		const output = await format(source);
		assert.doesNotMatch(output, /\{(?:#|:)[^\n]*\}</);
		assert.doesNotMatch(output, />\{\//);
		assert.equal(await format(output), output);
	}
});

test('Tailwind sorting and ordinary script formatting still work', async () => {
	const output = await format(
		`<script>const label="{#if ready}";</script>{#if ready}<span class="text-sm p-2 flex" title={'{:else}'}>{label}</span>{/if}`
	);
	assert.match(output, /const label = '\{#if ready\}';/);
	assert.match(output, /class="flex p-2 text-sm"/);
	assert.match(output, /title=\{'\{:else\}'\}/);
	assert.equal(await format(output), output);
});

test('literal whitespace and prettier-ignore remain intact', async () => {
	for (const source of [
		'<pre>{#if ready}a{:else}b{/if}</pre>',
		'<textarea>first  second</textarea>',
		'<!-- prettier-ignore -->\n{#if ready}<span>A</span>{:else}<span>B</span>{/if}'
	]) {
		assert.equal(await format(source), source + '\n');
	}
});

test('reverted catalog conditional expands and repeated formatting is stable', async () => {
	const source = await readFile(
		new URL('../src/routes/user/programs/+page.svelte', import.meta.url),
		'utf8'
	);
	const reverted = source
		.replace(/\{#if program\.activeCurriculumId\}\s*<a/, '{#if program.activeCurriculumId}<a')
		.replace(
			/\{:else\}\s*(<span class="text-xs text-base-content\/50">No active curriculum<\/span>)\s*\{\/if\}/,
			'{:else}$1{/if}'
		);
	const output = await format(reverted);
	assert.match(output, /\{#if program\.activeCurriculumId\}\n\s+<a/);
	assert.match(
		output,
		/\{:else\}\n\s+<span class="text-xs text-base-content\/50">No active curriculum<\/span>\n\s+\{\/if\}/
	);
	assert.equal(await format(output), output);
});
