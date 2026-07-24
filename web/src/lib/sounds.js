// Move and capture are recorded knocks (static/sounds/*.mp3), two different
// hits cut from the same recording so they match in character:
// pixabay.com/sound-effects/film-special-effects-chess-pieces-60890 —
// Pixabay Content License, commercial use ok, no attribution required.

let ctx;

// created lazily so it's always after a user gesture (autoplay policy)
const context = () => {
	ctx ??= new AudioContext();
	if (ctx.state === "suspended") ctx.resume();
	return ctx;
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
	const c = context();
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
