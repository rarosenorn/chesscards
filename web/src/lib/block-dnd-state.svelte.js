// Shared drag state for the add-cards editor's board dnd (v1's cardDnd
// equivalent):
// the dragged item's measured height must be known to EVERY island a
// cross-block drag passes through, so its shadow placeholder renders as an
// empty box of the right size instead of a re-mounting board (v1's fix for
// the drag-start jump).
export const blockDnd = $state({ dragHeight: 0, dragging: false });
