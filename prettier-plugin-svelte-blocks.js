import * as tailwind from 'prettier-plugin-tailwindcss';

/**
 * @param {import('svelte/compiler').AST.Root | import('svelte/compiler').AST.TemplateNode} node
 * @returns {import('svelte/compiler').AST.Fragment[]}
 */
function blockFragments(node) {
	switch (node.type) {
		case 'IfBlock':
			return [node.consequent, node.alternate].filter((fragment) => fragment != null);
		case 'EachBlock':
			return [node.body, node.fallback].filter((fragment) => fragment != null);
		case 'AwaitBlock':
			return [node.pending, node.then, node.catch].filter((fragment) => fragment != null);
		case 'KeyBlock':
			return [node.fragment];
		case 'SnippetBlock':
			return [node.body];
		default:
			return [];
	}
}

/**
 * @param {import('svelte/compiler').AST.TemplateNode[]} nodes
 * @param {number} index
 */
function startOnNewLine(nodes, index) {
	const first = nodes[index];
	if (first.type === 'Text') {
		if (!/^[\t\f\r ]*\n/.test(first.raw ?? first.data)) {
			first.raw = '\n' + (first.raw ?? first.data);
			first.data = '\n' + first.data;
		}
	} else {
		nodes.splice(index, 0, {
			type: 'Text',
			start: first.start,
			end: first.start,
			raw: '\n',
			data: '\n'
		});
	}
}

/** @param {import('svelte/compiler').AST.Fragment} fragment */
function expandFragment(fragment) {
	const nodes = fragment?.nodes;
	if (!nodes?.length || (nodes.length === 1 && nodes[0].type === 'IfBlock' && nodes[0].elseif))
		return;

	const last = nodes[nodes.length - 1];
	startOnNewLine(nodes, 0);
	if (last.type === 'Text') {
		if (!/\n[\t\f\r ]*$/.test(last.raw ?? last.data)) {
			last.raw = (last.raw ?? last.data) + '\n';
			last.data += '\n';
		}
	} else {
		nodes.push({ type: 'Text', start: last.end, end: last.end, raw: '\n', data: '\n' });
	}
}

/** @param {import('svelte/compiler').AST.Root | import('svelte/compiler').AST.TemplateNode} node */
function expandBlocks(node) {
	// Whitespace inside these elements is rendered literally.
	if (node.type === 'RegularElement' && ['pre', 'textarea'].includes(node.name)) return;

	for (const fragment of blockFragments(node)) expandFragment(fragment);
	for (const value of Object.values(node)) {
		if (value?.type === 'Fragment') {
			for (let index = 0; index < value.nodes.length; index++) {
				const child = value.nodes[index];
				expandBlocks(child);
				if (blockFragments(child).length && index + 1 < value.nodes.length) {
					startOnNewLine(value.nodes, index + 1);
				}
			}
		}
	}
}

// Extend Tailwind's parser so class sorting still runs before block formatting.
export const options = tailwind.options;
export const printers = tailwind.printers;
const original = tailwind.parsers.svelte;
const parser = typeof original === 'function' ? await original() : original;
if (!parser) throw new Error('Tailwind Svelte parser unavailable');

/** @type {NonNullable<import('prettier').Plugin['parsers']>} */
export const parsers = {
	...tailwind.parsers,
	svelte: {
		...parser,
		async parse(text, options) {
			const ast = await parser.parse(text, options);
			if (options.htmlWhitespaceSensitivity === 'ignore') expandBlocks(ast);
			return ast;
		}
	}
};
