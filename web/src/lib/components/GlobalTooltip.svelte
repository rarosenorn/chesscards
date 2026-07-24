<script>
	// App-wide tooltip: intercepts every [title] on hover (the attribute is
	// moved to data-tip so the native tooltip never appears) and shows a
	// custom bubble after 300ms instead of the ~1s native delay.
	let tip = $state(null); // { text, x, y }
	let currentEl = null;
	let timer;

	const handleOver = e => {
		const el = e.target.closest?.("[title], [data-tip]");
		if (el === currentEl) return;
		clearTimeout(timer);
		tip = null;
		currentEl = el;
		if (!el) return;
		if (el.hasAttribute("title")) {
			// svelte may re-set title on re-render; taking it again is fine
			el.dataset.tip = el.getAttribute("title");
			el.removeAttribute("title");
		}
		const text = el.dataset.tip;
		if (!text) return;
		const x = e.clientX, y = e.clientY;
		timer = setTimeout(() => tip = { text, x, y }, 300);
	}

	const handleOut = e => {
		if (currentEl && !currentEl.contains(e.relatedTarget)) {
			clearTimeout(timer);
			tip = null;
			currentEl = null;
		}
	}

	const hide = () => {
		clearTimeout(timer);
		tip = null;
	}
</script>

<svelte:document
	onmouseover={handleOver}
	onmouseout={handleOut}
	onmousedowncapture={hide}
	onwheelcapture={hide}
/>

{#if tip}
	<div
		class="tip-bubble"
		style:left={Math.min(tip.x, window.innerWidth - 320) + "px"}
		style:top={tip.y + 20 + "px"}
	>
		{tip.text}
	</div>
{/if}

<style>
	/* default-Firefox tooltip skin */
	.tip-bubble {
		position: fixed;
		z-index: 100;
		max-width: 300px;
		background-color: black;
		color: white;
		border-radius: 4px;
		padding: 5px 10px;
		font-size: 13px;
		font-weight: 500;
		pointer-events: none;
	}
</style>
