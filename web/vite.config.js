import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// component tests mount into jsdom, which needs svelte's browser build —
	// the server build's mount() throws. Tests only: the app's own build
	// resolves as it always has.
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	test: {
		environment: 'jsdom',
		include: ['src/**/*.test.js']
	}
});
