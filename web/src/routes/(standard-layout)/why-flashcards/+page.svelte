<script>
	// TODO add about its "externally structured", its nice that you dont have to be self directed to learn, just do flashcards and youll learn
	// TODO add about it fits into any time slot, 2 minutes or 2 hours, easy to do on bus,on toilet, etc. etc. 
	// TODO add about bite sized, short discrete units means continuous dopamine (like the tok)
	// TODO include "internalize" and "assimilate" to describe: "to understand and remember new information and make it part of your basic knowledge so that you can use it as your own"
	import BarChart from "./BarChart.svelte"
</script>

<article>
	<h2>Table of contents</h2>
	<nav>
		<ul>
			<li><a href="#introduction">Introduction</a></li>
			<li><a href="#anecdotes">Anecdotes</a></li>
			<li>
				<a href="#science">Science</a>
				<ul>
					<li><a href="#forgetting-curve">Forgetting curve</a></li>
					<li><a href="#testing-effect">Testing effect (active recall)</a></li>
					<li><a href="#spacing-effect">Spacing effect (spaced repetition)</a></li>
				</ul>
			</li>
			<li><a href="#more-reasons">More reasons</a></li>
		</ul>
	</nav>

	<section>
		<h2 id="introduction">Introduction</h2>
		<p>"What I hear i forget, what I see I remember, what I do I understand" - Xunzi Zi, philosopher (paraphrase). "Repetition is the mother of studies" - Latin proverb. "Due to the testing and spacing effects, studying with flashcards is so efficient that you will finally have time to call your mom" - me</p>
		<p>In the context of chess, we can define learning as the process of creating a mental model accurately and exhaustively mirrors the subject of chess and that is easily accessible when playing. ...Something about understanding vs knowing and how understanding is superior, in chess because it causes you to be more aware of the thing when playing and being able to know how it affects play and how it relates to other parts of chess vs. knowing that its good but not understanding why its good.
		</p>
		<p>If how well you know a subject can be defined as the degree to which your mental model accurately and exhaustively mirrors the subject and how easily accessible the mental model is in relevant circumstances, then we can define learning as the process of creating that mental model.</p>
		<p>In this article I'll try convince you that studying with flashcards is a good way to learn. We start out by looking at anecdotes from people who have used flashcards. Then we'll look at the fact that humans forget information over time (most of us atleast) and how to remedy this with the testing and spacing effects.</p>

		<p>...broadly relatable example... (maybe with english words that are synonyms, its easy to illustrate differing degrees of accuracy and exhaustiveness of mental model. e.g. what does impudent, insolent and impertinent mean, what the difference between them. From "its something about being rude" to knowing exactly and the differences between them etc.</p>
	</section>
	<section>
		<h2 id="anecdotes">Anecdotes</h2>
		<blockquote>
			"I'm getting better results even though I'm spending less time studying."
			<footer>- <cite>Sanjush, final year medical student at Leeds University</cite></footer>
		</blockquote>
		<p>Harvard Medical School recommends students to read the book Make it Stick, which is a big proponent for active recall and spaced repetition.(...source podcast with Make it Stick author...)</p>
		<blockquote>
			"I can say with Anki [Flashcard app], I was able to go through medical school. I was exercising every day, I was getting the amount of sleep I wanted to get, I was calling my parents every day. I felt so much less stressed, and I still got just as good of outcomes. I'm still able to feel competent in the hospital. That's astounding to me, because that didn't happen to me in undergrad. I was sleeping four hours a night and just trying to make ends meet. And now I have this tool and I feel amazing. I have a life." 
			<footer>- <cite>Prerak, 3rd year medical student at Yale</cite></footer>
		</blockquote>
		<p>...find examples from make it stick...</p>
	</section>
	<section>
		<h2 id="science">Science</h2>
		<section>
			<h3 id="forgetting-curve">Forgetting curve</h3>
		</section>
		<section>
			<h3 id="testing-effect">Testing effect</h3>
			<BarChart 
				id="chart1"
				title="Chart 1: Retetion from different study methods"
				subtitle="20 students in each group. Equal amount of time spend on mindmap and free recall test methods:"
				labels={["Read 1 time", "Read 4 times", "Mindmap", "Free recall test"]} 
				colors={["red", "orangered", "orange", "green"]}
				data={[0.28, 0.52, 0.44, 0.65]} 
				note='Data from "Read 1 time" and "Read 4 times" have been read approximately from chart in source.'
				source="Karpicke & Blunt (2011). Retrieval Practice Produces More Learning than Elaborative Studying with Concept Mapping. Science."
			/>
			<BarChart
				id="chart2"
				title="Chart 2: Retention from rereading vs. recalling"
				subtitle={null}
				data={[0.40, 0.61]}
				labels={["Repeated reating", "Free recall testing"]}
				colors={["orangered", "green"]}
				note={null}
				source="Roediger & Karpicke (2006). Test-Enhanced Learning: Taking Memory Tests Improves Long-Term Retention. Psychological Science."
			/>
		</section>
		<section>
			<h3 id="spacing-effect">Spacing effect</h3>
			<BarChart
				id="chart3"
				title="Chart 3: Retention from  massed practice vs. spaced practice. Equal study time"
				subtitle={null}
				data={[0.35, 0.55]}
				labels={["Massed practice (cramming)", "Spaced pracitce"]}
				colors={["orangered", "green"]}
				note={null}
				source="Cepeda et al. (2006). Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis. Psychological Bulletin."
			/>
		</section>
	</section>
	<section>
		<h2 id="more-reasons">More reasons</h2>
		<p>...Humans are bad judges on how well we know something...</p>
		<p>...Confidence that you will learn what there is in cards...</p>
		<p>...Interleaving of different but related subjects...</p>
	</section>
	<ul>
		<li>
			The short explanation is that with flashcards you actively recall
			knowledge and skills from your brain with increasing time intervals,
			these two concepts are called active recall and spaced repetition
			respectivelyand science says that these methods learning are very
			effective and the science is backed up by anecdotes. Below are more
			elaborate explanations of the concepts, presentatin of some of the
			scientific results and anecdotes from people who have used
			flashcards for learning.
		</li>
		<li>
			Also because you have confidence that if some information is in a
			your flashcard deck and you keep up with the deck, you will learn
			and remember the information. As opposed to for example reading a
			book or attending a course, most people would forget the majority of
			the content (forgetting curve).
		</li>
		<li>
			Possible reason for why it works: (reword to be more clear and
			concise) (the following is a speculation) A reason for this could be
			that it takes resources and enery to understand something and store
			it in the long term memory, so nature made it so we only deeply
			understand and store in long term memory what is necessary. When you
			try to extract the same piece of information from your brain with
			intervals, the brain deems it more efficient to understand and store
			in more permanently than struggle with recalling. Also the mental
			model of the subject is refined each time you reproduce it from the
			brain. An analogy is going to the gym to get muscles, its energy
			demanding so it will only make the muscles/ retain them if its
			necessary, otherwise its not energy efficient.
		</li>
	</ul>
</article>

<style>
	p {
		margin-bottom: 20px;
	}
</style>
