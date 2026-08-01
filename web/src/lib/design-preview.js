// The /design page's tryout state: an accent scheme and a wordmark font
// override, kept in localStorage and re-applied on every load by the root
// layout, so a candidate rides along across the whole app until reset on
// /design. Nothing here touches app.css — making a choice permanent stays a
// code change. Tryout fonts come off Google Fonts; a chosen one gets
// self-hosted when made permanent.

const SCHEME_KEY = "chesscards:scheme-preview";
const FONT_KEY = "chesscards:font-preview";

const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Red+Hat+Mono:wght@400;500&family=Space+Mono:wght@400;700&family=Victor+Mono:wght@400;500&display=swap";

const readPreview = key => {
	try {
		return JSON.parse(localStorage.getItem(key));
	} catch {
		return null;
	}
}

const applySchemeVars = scheme => {
	const root = document.documentElement.style;
	root.setProperty("--accent", scheme.accent);
	root.setProperty("--accent-hover", scheme.hover);
	root.setProperty("--accent-subtle", scheme.subtle);
	root.setProperty("--accent-subtle-strong", scheme.strong);
}

const clearSchemeVars = () => {
	const root = document.documentElement.style;
	for (const name of ["--accent", "--accent-hover", "--accent-subtle", "--accent-subtle-strong"]) {
		root.removeProperty(name);
	}
}

// one stylesheet serves every tryout font; added at most once per page
const ensureFontStylesheet = () => {
	if (document.getElementById("design-preview-fonts")) return;
	const link = document.createElement("link");
	link.id = "design-preview-fonts";
	link.rel = "stylesheet";
	link.href = GOOGLE_FONTS_URL;
	document.head.appendChild(link);
}

const applyFontVar = family => {
	ensureFontStylesheet();
	document.documentElement.style.setProperty("--wordmark-font", `"${family}"`);
}

const clearFontVar = () =>
	document.documentElement.style.removeProperty("--wordmark-font");

export { SCHEME_KEY, FONT_KEY, readPreview, applySchemeVars, clearSchemeVars, ensureFontStylesheet, applyFontVar, clearFontVar }
