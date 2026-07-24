-- borders become: the app's own black board border (default) or cm-chessboard's
-- wide coordinate frame
alter table users drop constraint users_border_type_check;
update users set border_type = 'black' where border_type in ('none', 'thin');
alter table users alter column border_type set default 'black';
alter table users add constraint users_border_type_check check (border_type in ('black', 'frame'));
