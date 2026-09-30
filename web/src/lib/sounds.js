// Move and capture are recorded knocks (static/sounds/*.mp3), two different
// hits cut from the same recording so they match in character:
// pixabay.com/sound-effects/film-special-effects-chess-pieces-60890 —
// Pixabay Content License, commercial use ok, no attribution required.

let ctx;

// Browsers only let audio start from a real gesture (a click or key, not a
// wheel scroll), so the context is opened on the first one — and the samples
// decoded then too, so the first move doesn't wait on them. Until then moves
// are silent: a sound started on a suspended context would be held and burst
// out, piled up, the moment it resumed.
const unlock = () => {
	ctx ??= new AudioContext();
	if (ctx.state === "suspended") ctx.resume();
	for (const sample of Object.values(samples)) load(ctx, sample).catch(() => sample.promise = null);
}
if (typeof window !== "undefined") {
	for (const type of ["pointerdown", "keydown"]) {
		window.addEventListener(type, unlock, { capture: true, once: true });
	}
}

const samples = {
	move: { url: "/sounds/move.mp3", buffer: null, promise: null },
	capture: { url: "/sounds/capture.mp3", buffer: null, promise: null }
};

const load = (c, sample) =>
	sample.promise ??= fetch(sample.url)
		.then(response => response.arrayBuffer())
		.then(data => c.decodeAudioData(data))
		.then(buffer => sample.buffer = buffer);

const play = async name => {
	const c = ctx;
	if (!c) return;
	// the gesture that opens the context may itself be the move (an arrow
	// key), before resume() has landed
	if (c.state !== "running") {
		if (!navigator.userActivation?.isActive) return;
		await c.resume();
	}
	const sample = samples[name];
	let buffer = sample.buffer;
	// the first play waits for fetch+decode (a moment late); afterwards the
	// decoded buffer plays instantly. A failed load retries on the next move.
	if (!buffer) {
		try { buffer = await load(c, sample); }
		catch { sample.promise = null; return; }
	}
	const source = c.createBufferSource();
	source.buffer = buffer;
	source.connect(c.destination);
	source.start();
}

const playMove = () => play("move");
const playCapture = () => play("capture");
const playMoveSound = san => san?.includes("x") ? playCapture() : playMove();

export { playMove, playCapture, playMoveSound };
