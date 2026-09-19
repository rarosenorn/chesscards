<script>
	// crop box matches the marketplace card thumbnail ratio (3:2);
	// the crop is rendered at 2x this size
	const previewWidth = 300;
	const previewHeight = 200;
	const outputWidth = 600;
	const outputHeight = 400;

	let { file } = $props();

	// the chosen image and its placement inside the crop box:
	// cover-fit base scale times a user-controlled zoom factor.
	// Zooming out below 1 letterboxes the image (white fills the rest).
	let imageElement = $state(null);
	let baseScale = $state(0);
	let zoom = $state(1);
	let scale = $derived(baseScale * zoom);
	let offsetX = $state(0);
	let offsetY = $state(0);

	// contain-fit (whole image visible) is the zoom-out limit
	let minZoom = $state(1);
	const maxZoom = 4;

	$effect(() => {
		const imageUrl = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			// cover-fit: scale so the image fills the box, center the overflow
			baseScale = Math.max(previewWidth / img.naturalWidth, previewHeight / img.naturalHeight);
			const containScale = Math.min(previewWidth / img.naturalWidth, previewHeight / img.naturalHeight);
			// zoom out to half of contain-fit, so well past whole-image
			minZoom = containScale / baseScale / 2;
			zoom = 1;
			offsetX = (previewWidth - img.naturalWidth * baseScale) / 2;
			offsetY = (previewHeight - img.naturalHeight * baseScale) / 2;
			imageElement = img;
		}
		img.src = imageUrl;
		return () => URL.revokeObjectURL(imageUrl);
	});

	// An axis where the image overflows the box is clamped so no gap appears;
	// an axis where it's smaller than the box stays centered.
	const clampOffsets = atScale => {
		const width = imageElement.naturalWidth * atScale;
		const height = imageElement.naturalHeight * atScale;
		offsetX = width >= previewWidth
			? Math.min(0, Math.max(previewWidth - width, offsetX))
			: (previewWidth - width) / 2;
		offsetY = height >= previewHeight
			? Math.min(0, Math.max(previewHeight - height, offsetY))
			: (previewHeight - height) / 2;
	}

	// zooms while keeping the point at the center of the crop box fixed
	const setZoom = newZoom => {
		if (!imageElement) return;
		newZoom = Math.min(maxZoom, Math.max(minZoom, newZoom));
		const oldScale = scale;
		const newScale = baseScale * newZoom;
		offsetX = previewWidth / 2 - (previewWidth / 2 - offsetX) / oldScale * newScale;
		offsetY = previewHeight / 2 - (previewHeight / 2 - offsetY) / oldScale * newScale;
		zoom = newZoom;
		clampOffsets(newScale);
	}

	const handleWheel = event => {
		if (!imageElement) return;
		event.preventDefault();
		setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
	}

	// drag to choose which part of the image the thumbnail shows
	let dragStart = null;

	const handlePointerDown = event => {
		if (!imageElement) return;
		event.preventDefault();
		dragStart = { x: event.clientX - offsetX, y: event.clientY - offsetY };
		event.target.setPointerCapture(event.pointerId);
	}

	const handlePointerMove = event => {
		if (!dragStart || !imageElement) return;
		offsetX = event.clientX - dragStart.x;
		offsetY = event.clientY - dragStart.y;
		clampOffsets(scale);
	}

	const handlePointerUp = () => dragStart = null;

	// renders the crop box exactly as shown (crop, zoom, letterboxing)
	// to a jpeg blob at the output size
	export const crop = () => new Promise(resolve => {
		const canvas = document.createElement("canvas");
		canvas.width = outputWidth;
		canvas.height = outputHeight;
		const context = canvas.getContext("2d");
		// white behind letterboxing and transparent png/webp regions
		context.fillStyle = "white";
		context.fillRect(0, 0, outputWidth, outputHeight);
		const factor = outputWidth / previewWidth;
		context.drawImage(
			imageElement,
			offsetX * factor, offsetY * factor,
			imageElement.naturalWidth * scale * factor, imageElement.naturalHeight * scale * factor
		);
		canvas.toBlob(resolve, "image/jpeg", 0.9);
	})
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only pan refinement; the crop works without it (centered by default) -->
<div
	class="crop-preview"
	style="width: {previewWidth}px; height: {previewHeight}px;"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onwheel={handleWheel}
>
	{#if imageElement}
		<img
			src={imageElement.src}
			alt="Thumbnail preview"
			draggable="false"
			style="
				width: {imageElement.naturalWidth * scale}px;
				height: {imageElement.naturalHeight * scale}px;
				transform: translate({offsetX}px, {offsetY}px);
			"
		/>
	{/if}
</div>
<div class="zoom-row">
	<button
		type="button"
		class="zoom-btn"
		aria-label="Zoom out"
		disabled={zoom <= minZoom}
		onclick={() => setZoom(zoom / 1.2)}
	>
		−
	</button>
	<button
		type="button"
		class="zoom-btn"
		aria-label="Zoom in"
		disabled={zoom >= maxZoom}
		onclick={() => setZoom(zoom * 1.2)}
	>
		+
	</button>
</div>
<p class="crop-hint">Drag the image to reposition, scroll or use − / + to zoom</p>

<style>
	.crop-preview {
		overflow: hidden;
		position: relative;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		cursor: grab;
		touch-action: none;
	}
	.crop-preview:active {
		cursor: grabbing;
	}
	.crop-preview img {
		position: absolute;
		max-width: none;
		user-select: none;
	}
	.zoom-row {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 6px;
	}
	.zoom-btn {
		width: 32px;
		height: 32px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		background-color: white;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
	}
	.zoom-btn:hover:enabled {
		background-color: gainsboro;
	}
	.zoom-btn:disabled {
		color: rgba(0, 0, 0, 0.3);
		cursor: default;
	}
	.crop-hint {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
		text-align: center;
		margin: 6px 0 0 0;
	}
</style>
