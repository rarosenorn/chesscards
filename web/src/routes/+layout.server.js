const load = async ({ locals }) => {
	// filled by hooks.server.js from the better-auth session; the board
	// preferences live on the user row as additional fields
	const user = locals.user;
	if (!user) return;

	return {
		user: {
			email: user.email,
			isAdmin: user.isAdmin,
			displayName: user.name
		},
		boardPrefs: {
			pieceSet: user.pieceSet,
			boardTheme: user.boardTheme,
			borderType: user.borderType,
			showCoordinates: user.showCoordinates,
			animationDuration: user.animationDuration
		}
	}
}


export { load }
