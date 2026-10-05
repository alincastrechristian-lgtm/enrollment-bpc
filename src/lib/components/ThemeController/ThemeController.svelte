<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	type ThemeContext = {
		isDark: boolean;
		toggleTheme: () => void;
	};

	let {
		children
	}: {
		children: Snippet<[ThemeContext]>;
	} = $props();

	let isDark = $state(false);

	onMount(() => {
		const root = document.getElementById('app-theme');
		isDark = root?.getAttribute('data-theme') === 'dark';
	});

	function toggleTheme() {
		const theme = isDark ? 'light' : 'dark';

		isDark = !isDark;

		document.getElementById('app-theme')?.setAttribute('data-theme', theme);

		document.cookie = `theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
	}
</script>

{@render children({ toggleTheme, isDark })}
