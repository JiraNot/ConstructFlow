export function buildMultiViewGridTracks(paneCount: number, layout: string, primaryPanePercent?: number, customColumnCount?: number, customColumnShares?: number[], customRowShares?: number[]): { columns: string; rows: string }
export function getMultiViewTrackShares(trackCount: number, storedShares?: number[], fallbackFirstShare?: number): number[]
export function getMultiViewTrackBoundaries(shares: number[]): number[]
export function getMultiViewTrackBoundaryRange(shares: number[], boundaryIndex: number, minTrackShare?: number): { min: number; max: number }
export function resizeMultiViewTrackBoundary(shares: number[], boundaryIndex: number, position: number, minTrackShare?: number): number[]
export function buildPrimaryPaneGridStyle(paneCount: number, layout: string): { gridRow: string } | undefined
export function buildMultiViewPaneGridStyle(paneCount: number, layout: string, paneIndex: number, customColumnCount?: number): { gridColumn: string } | undefined
export function moveMultiViewPane<T extends string>(order: T[], paneSlot: T, direction: number, visiblePaneCount?: number): T[]
export function reorderMultiViewPane<T extends string>(order: T[], sourceSlot: T, targetSlot: T, visiblePaneCount?: number): T[]
