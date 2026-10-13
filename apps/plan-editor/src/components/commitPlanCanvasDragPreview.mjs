/** Validate and commit a released plan-canvas drag from its original gesture. */
export function commitPlanCanvasDragPreview({
  drag,
  rawWorld,
  ctrlKey,
  hasManualDimensions,
  movedPixels,
  buildCommands,
  preview,
  commit,
  onRejected,
}) {
  if (movedPixels < 3 && !hasManualDimensions) return

  const commands = buildCommands(drag, rawWorld, ctrlKey || hasManualDimensions)
  if (!commands.length) return

  const validation = preview(commands)
  if (validation.valid) commit(commands)
  else onRejected?.(validation.errors)
}
