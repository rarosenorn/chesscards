<script>
	import FormErrors from "$lib/components/FormErrors.svelte"

	let { data, form } = $props();
</script>

<p><a href="/admin/payouts">Payouts</a></p>

<FormErrors {form} />

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

<h2 class="renames">Pending rename requests</h2>
{#if data.renames.length === 0}
	<p>No pending requests</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Deck</th>
				<th>New name</th>
				<th>User</th>
				<th>Requested</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.renames as rename (rename.id)}
				<tr>
					<td><a href="/marketplace/{rename.slug}">{rename.currentName}</a></td>
					<td>{rename.name}</td>
					<td>{rename.email}</td>
					<td>{new Date(rename.createdAt).toLocaleDateString()}</td>
					<td class="rename-actions">
						<form method="POST" action="?/approveRename">
							<input type="hidden" name="requestId" value={rename.id}>
							<button class="std-btn">Approve</button>
						</form>
						<form method="POST" action="?/rejectRename">
							<input type="hidden" name="requestId" value={rename.id}>
							<input name="reason" required placeholder="Reason, shown to the author">
							<button class="std-btn">Reject</button>
						</form>
					</td>
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
	h2.renames {
		margin-top: 32px;
	}
	.rename-actions, .rename-actions form {
		display: flex;
		gap: 8px;
		align-items: center;
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
