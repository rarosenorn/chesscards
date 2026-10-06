<!-- A rubber stamp reading OWNED, drawn here: a solid block between two
     bars, its capitals knocked out of it (thick strokes cut off at cap
     height, as a mask), and speckled where the ink did not take. Its red is
     its own. -->
<svg viewBox="0 0 140 48" role="img" aria-label="Owned" fill="#c0392b">
	<defs>
		<clipPath id="owned-caps"><rect x="0" y="13" width="140" height="22" /></clipPath>
		<mask id="owned-letters">
			<rect width="140" height="48" fill="white" />
			<g clip-path="url(#owned-caps)" fill="none" stroke="black" stroke-width="5" stroke-miterlimit="10">
				<rect x="16" y="15.5" width="13" height="17" rx="6.5" />
				<path d="M38 10l6.2 22 4.3-14 4.3 14 6.2-22" />
				<path d="M68 37V13l13 22V11" />
				<path d="M91 13v22M88.5 15.5h15M88.5 24h12M88.5 32.5h15" />
				<path d="M111 15.5h5.5a7.5 8.5 0 0 1 0 17H111Z" />
			</g>
		</mask>
		<filter id="owned-wear" x="0" y="0" width="100%" height="100%">
			<feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="11" result="noise" />
			<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -22 15.6" result="specks" />
			<feComposite in="SourceGraphic" in2="specks" operator="in" />
		</filter>
	</defs>
	<g filter="url(#owned-wear)">
		<path d="M0 0h140v3H0zM0 45h140v3H0z" />
		<rect y="6" width="140" height="36" mask="url(#owned-letters)" />
	</g>
</svg>
