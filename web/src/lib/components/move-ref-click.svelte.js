// a reactive props bag for component tests: runes only compile in .svelte.js
export const reactiveCard = card => {
	const props = $state({ card });
	return props;
}
