import { formatHex, parse } from 'culori';
import layoutCss from '../../routes/layout.css?raw';

// Raw CSS is bundled by Vite, so deployed email rendering needs no source files.
export function readEmailTheme(css: string) {
	const blocks = css
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.matchAll(/@plugin\s+(['"])daisyui\/theme\1\s*\{([^}]*)\}/g);
	const light = [...blocks].find((block) => /\bname\s*:\s*(['"])light\1\s*;/.test(block[2]))?.[2];
	if (!light) throw new Error('Email templates require the light theme in layout.css');

	function color(token: string): string {
		const value = light!.match(new RegExp(`--color-${token}\\s*:\\s*([^;]+);`))?.[1].trim();
		const parsed = value ? parse(value) : undefined;
		if (!parsed || (parsed.alpha !== undefined && parsed.alpha !== 1)) {
			throw new Error(`Email theme requires an opaque CSS color for --color-${token}`);
		}
		return formatHex(parsed);
	}

	return {
		background: color('base-200'),
		surface: color('base-100'),
		border: color('base-300'),
		text: color('base-content'),
		primary: color('primary'),
		primaryContent: color('primary-content')
	};
}

export const emailTheme = readEmailTheme(layoutCss);
