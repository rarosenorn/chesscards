// Promise-based app modals, rendered by ModalHost (mounted once in the root
// layout). Module-level state is safe here despite SSR sharing: modals are
// only ever opened from client-side interaction handlers.
const modalState = $state({ current: null });

const open = options => new Promise(resolve => {
	modalState.current = { ...options, resolve };
});

// Yes/no question; resolves true on confirm, false on cancel/Esc/backdrop.
const confirmModal = ({ title, message, confirmLabel = "OK", cancelLabel = "Cancel", danger = false }) =>
	open({ kind: "confirm", title, message, confirmLabel, cancelLabel, danger });

// Destructive confirmation: the confirm button unlocks only after the user
// types requiredText exactly.
const typedConfirmModal = ({ title, message, requiredText, confirmLabel = "Delete", cancelLabel = "Cancel" }) =>
	open({ kind: "typed", title, message, requiredText, confirmLabel, cancelLabel, danger: true });

const settleModal = result => {
	modalState.current?.resolve(result);
	modalState.current = null;
};

export { modalState, confirmModal, typedConfirmModal, settleModal }
