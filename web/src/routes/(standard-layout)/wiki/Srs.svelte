<p>
	Chesscards schedules basic cards with
	<strong>FSRS</strong> (Free Spaced Repetition Scheduler). FSRS models how
	well you hold each card and picks the next date from that, rather than
	multiplying a fixed interval.
</p>

<h3>Grading a basic card</h3>
<p>
	Reveal the answer with <strong>Space</strong>, then grade it:
</p>
<ul>
	<li><strong>Again</strong> (1) — you did not have it. The card comes back today.</li>
	<li><strong>Hard</strong> (2) — you got there, but slowly.</li>
	<li><strong>Good</strong> (3) — you knew it.</li>
	<li><strong>Easy</strong> (4) — you knew it immediately.</li>
</ul>
<p>
	Each button shows the date it would set, so the schedule is never a
	surprise. A card moves through <em>New</em>, <em>Learning</em>,
	<em>Review</em> and, after a lapse, <em>Relearning</em>; the
	<strong>Cards</strong> tab shows where each one stands.
</p>

<h3>Tactic cards</h3>
<p>
	A tactic has one right answer, so it is not scheduled the same way.
	<strong>Correct</strong> (2, or Space) finishes it for good — you have
	solved it and will not see it again. <strong>Incorrect</strong> (1) brings
	it back a day later, far enough out that getting it right the second time
	cannot come from short-term memory.
</p>

<h3>Chapter progression</h3>
<p>
	A deck can hold its later chapters shut until the earlier ones are
	learned, which keeps a long deck from introducing everything at once.
	Turn it on under a deck's <strong>Settings</strong>.
</p>
<p>
	A chapter <strong>passes</strong> when every card in it has been seen and
	at least <strong>80%</strong> have graduated — proved once, meaning they
	have reached Review (or Relearning after a lapse). Chapters open
	cumulatively: the first is always open, and each next one opens when every
	chapter before it has passed.
</p>
<p>
	Progression gates only the introduction of <em>unseen</em> cards. A card
	you have already met keeps coming back for review even if its chapter
	falls behind the bar — because cards moved, or chapters were regrouped.
	Nothing is stored as an unlock flag: it is computed from the cards
	themselves, so resetting a deck's schedule re-locks its later chapters by
	itself.
</p>
