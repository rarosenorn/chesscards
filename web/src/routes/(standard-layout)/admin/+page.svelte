<script>
	let { data } = $props();
</script>

<p><a href="/admin/payouts">Payouts</a></p>

<h2>Pending upload requests</h2>
{#if data.requests.length === 0}
	<p>No pending requests</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Deck</th>
				<th>User</th>
				<th>Theme</th>
				<th>Price</th>
				<th>Cards</th>
				<th>Requested</th>
			</tr>
		</thead>
		<tbody>
			{#each data.requests as request (request.id)}
				<tr>
					<td><a href="/admin/{request.id}">{request.name}</a></td>
					<td>{request.email}</td>
					<td>{request.theme}</td>
					<td>{Number(request.price) === 0 ? "Free" : request.price}</td>
					<td>{request.cardCount}</td>
					<td>{new Date(request.createdAt).toLocaleDateString()}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<h2 class="changes">Pending change requests</h2>
{#if data.changes.length === 0}
	<p>No pending requests</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Deck</th>
				<th>Changes</th>
				<th>User</th>
				<th>Requested</th>
			</tr>
		</thead>
		<tbody>
			{#each data.changes as change (change.id)}
				<tr>
					<td><a href="/admin/changes/{change.id}">{change.currentName}</a></td>
					<td>{change.parts.join(", ")}{#if change.name}: "{change.name}"{/if}</td>
					<td>{change.email}</td>
					<td>{new Date(change.createdAt).toLocaleDateString()}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	h2 {
		font-size: 1.2rem;
		margin-bottom: 12px;
	}
	h2.changes {
		margin-top: 32px;
	}
	table {
		border-collapse: collapse;
	}
	th {
		text-align: left;
	}
	th, td {
		padding: 4px 24px 4px 0;
	}
	tbody > tr:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
</style>
