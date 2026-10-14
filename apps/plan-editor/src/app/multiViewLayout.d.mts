export function buildMultiViewGridTracks(paneCount: number, layout: string, primaryPanePercent?: number, customColumnCount?: number): { columns: string; rows: string }
export function buildPrimaryPaneGridStyle(paneCount: number, layout: string): { gridRow: string } | undefined
export function buildMultiViewPaneGridStyle(paneCount: number, layout: string, paneIndex: number, customColumnCount?: number): { gridColumn: string } | undefined
