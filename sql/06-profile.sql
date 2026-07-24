alter table users
	add column display_name text,
	add column piece_set text not null default 'standard'
		check (piece_set in ('standard', 'staunty')),
	add column board_theme text not null default 'default'
		check (board_theme in ('default', 'default-contrast', 'green', 'blue', 'chess-club', 'chessboard-js', 'black-and-white')),
	add column border_type text not null default 'none'
		check (border_type in ('none', 'thin', 'frame')),
	add column show_coordinates boolean not null default true,
	add column animation_duration smallint not null default 300
		check (animation_duration in (0, 150, 300));
