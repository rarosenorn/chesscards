<!-- A rubber stamp reading OWNED, drawn here: double-ruled, stencil capitals
     built from thick strokes cut off at cap height, and worn where the ink
     did not take (the filter knocks specks out of it). Its red is its own. -->
<svg viewBox="0 0 140 48" role="img" aria-label="Owned" fill="none" stroke="#c0392b">
	<defs>
		<clipPath id="owned-caps"><rect x="0" y="13" width="140" height="22" /></clipPath>
		<mask id="owned-stencil">
			<rect width="140" height="48" fill="white" stroke="none" />
			<path d="M22.5 12v6M22.5 30v6M117 12v6M117 30v6" stroke="black" stroke-width="1.5" />
		</mask>
		<filter id="owned-wear" x="0" y="0" width="100%" height="100%">
			<feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="3" seed="7" result="noise" />
			<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -16 10.6" result="specks" />
			<feComposite in="SourceGraphic" in2="specks" operator="in" />
		</filter>
	</defs>
	<g filter="url(#owned-wear)">
		<rect x="2" y="2" width="136" height="44" rx="2.5" stroke-width="3" />
		<rect x="6.5" y="6.5" width="127" height="35" rx="1" stroke-width="1" />
		<g clip-path="url(#owned-caps)" mask="url(#owned-stencil)" stroke-width="5" stroke-linejoin="miter" stroke-miterlimit="10">
			<rect x="16" y="15.5" width="13" height="17" rx="6.5" />
			<path d="M38 10l6.2 22 4.3-14 4.3 14 6.2-22" />
			<path d="M68 37V13l13 22V11" />
			<path d="M91 13v22M88.5 15.5h15M88.5 24h12M88.5 32.5h15" />
			<path d="M111 15.5h5.5a7.5 8.5 0 0 1 0 17H111Z" />
		</g>
	</g>
</svg>
