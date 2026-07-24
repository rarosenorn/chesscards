<script>
	import { modalState, settleModal } from "$lib/modals.svelte.js"

	let dialogElement = $state();
	let typed = $state("");

	const modal = $derived(modalState.current);

	// native <dialog> provides the focus trap, Esc handling and backdrop
	$effect(() => {
		if (!dialogElement) return;
		if (modal) {
			typed = "";
			dialogElement.showModal();
		} else if (dialogElement.open) {
			dialogElement.close();
		}
	});

	// fires on Esc and dialogElement.close(); only the former still has a modal
	const handleClose = () => {
		if (modalState.current) settleModal(false);
	}

	const handleBackdropClick = e => {
		if (e.target === dialogElement) settleModal(false);
	}

	const confirmDisabled = $derived(modal?.kind === "typed" && typed !== modal.requiredText);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -- backdrop dismissal; Esc already closes via the dialog itself -->
<dialog bind:this={dialogElement} onclose={handleClose} onclick={handleBackdropClick}>
	{#if modal}
		<div class="modal-content">
			<h2>{modal.title}</h2>
			<p class="message">{modal.message}</p>
			{#if modal.kind === "typed"}
				<label class="typed-label">
					<span>Type <strong>{modal.requiredText}</strong> to confirm</span>
					<!-- svelte-ignore a11y_autofocus -->
					<input bind:value={typed} autofocus autocomplete="off" spellcheck="false" />
				</label>
			{/if}
			<div class="actions">
				<button class="std-btn" onclick={() => settleModal(false)}>{modal.cancelLabel}</button>
				<button
					class="confirm-btn"
					class:danger={modal.danger}
					disabled={confirmDisabled}
					onclick={() => settleModal(true)}
				>
					{modal.confirmLabel}
				</button>
			</div>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		/* the app's css reset zeroes margins; restore the UA's auto-centering */
		margin: auto;
		border: none;
		border-radius: 10px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
		padding: 0;
		width: 420px;
		max-width: calc(100vw - 40px);
	}
	dialog::backdrop {
		background-color: rgba(0, 0, 0, 0.4);
	}
	.modal-content {
		padding: 22px 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.message {
		margin: 0;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.75);
		line-height: 1.45;
	}
	.typed-label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.typed-label input {
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 1rem;
	}
	.typed-label input:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.actions {
		display: flex;
		justify-content: end;
		gap: 8px;
		margin-top: 6px;
	}
	.confirm-btn {
		border: 1px solid var(--accent);
		border-radius: 5px;
		background-color: var(--accent);
		color: white;
		padding: 6px 16px;
		cursor: pointer;
	}
	.confirm-btn:hover:enabled {
		background-color: var(--accent-hover);
		border-color: var(--accent-hover);
	}
	.confirm-btn.danger {
		background-color: #c62828;
		border-color: #c62828;
	}
	.confirm-btn.danger:hover:enabled {
		background-color: #a31f1f;
		border-color: #a31f1f;
	}
	.confirm-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
