/** @type {import("prettier").Config} */

import * as svelteBlocks from './prettier-plugin-svelte-blocks.js';

const config = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	singleAttributePerLine: false,
	plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss', svelteBlocks],
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte',
				htmlWhitespaceSensitivity: 'ignore'
			}
		}
	],
	tailwindStylesheet: './src/routes/layout.css'
};

export default config;
