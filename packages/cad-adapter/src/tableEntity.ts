// AutoCAD ACAD_TABLE Entity Serializer

export interface CadTableColumn {
  widthMm: number;
}

export interface CadTableCell {
  text: string;
  alignment?: "center" | "left" | "right";
  textHeightMm?: number;
}

export interface CadTableData {
  title: string;
  insertionPointMm: [number, number, number]; // [x, y, z]
  columns: CadTableColumn[];
  rows: CadTableCell[][]; // [rowIndex][colIndex]
  layer?: string;
  paperSpace?: boolean;
}

/**
 * Serializes an editable AutoCAD TABLE entity (ACAD_TABLE) in DXF format.
 */
export function formatAcadTableDxf(
  data: CadTableData,
  handle: string,
  ownerHandle: string,
  tableStyleHandle: string = "0",
): string {
  const layer = data.layer ?? "ANNO-TEXT";
  const numRows = data.rows.length;
  const numCols = data.columns.length;
  const ins = data.insertionPointMm;
  const defaultTextHeight = 2.5;

  const lines: string[] = [
    "  0",
    "TABLE",
    "  5",
    handle,
    "330",
    ownerHandle,
    "100",
    "AcDbEntity",
    "  8",
    layer,
    " 67",
    data.paperSpace ? "1" : "0",
    "100",
    "AcDbBlockReference",
    " 10",
    ins[0].toFixed(3),
    " 20",
    ins[1].toFixed(3),
    " 30",
    ins[2].toFixed(3),
    "100",
    "AcDbTable",
    "280",
    "0",
    "342",
    tableStyleHandle,
    " 71",
    numRows.toString(),
    " 72",
    numCols.toString(),
    " 40",
    "0.0", // horizontal cell margin
    " 41",
    "0.0", // vertical cell margin
  ];

  // Column widths
  for (const col of data.columns) {
    lines.push("142", col.widthMm.toFixed(3));
  }

  // Row heights and cell data
  for (let r = 0; r < numRows; r++) {
    const row = data.rows[r];
    const rowHeight = r === 0 ? 8.0 : 6.0;
    lines.push("141", rowHeight.toFixed(3));

    for (let c = 0; c < numCols; c++) {
      const cell = row[c] ?? { text: "" };
      const th = cell.textHeightMm ?? (r === 0 ? 3.0 : defaultTextHeight);
      lines.push(
        "171",
        "1", // cell type: 1 = text
        "172",
        "0", // flags
        "173",
        "0", // merged value
        "174",
        "0", // autofit
        "175",
        "0", // border flags
        "176",
        "0",
        "140",
        th.toFixed(3), // text height
        "170",
        cell.alignment === "center" ? "5" : cell.alignment === "right" ? "6" : "4", // alignment
        "  1",
        cell.text,
      );
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Generates vector lines and text fallback for table display
 * ensuring compatibility across all DWG/DXF viewers.
 */
export function formatTableLinesFallbackDxf(
  data: CadTableData,
  startHandleNum: number,
  ownerHandle: string,
): { dxf: string; nextHandle: number } {
  let h = startHandleNum;
  const lines: string[] = [];
  const layer = data.layer ?? "ANNO-TEXT";
  const spaceFlag = data.paperSpace ? "1" : "0";

  const totalWidth = data.columns.reduce((sum, c) => sum + c.widthMm, 0);
  let totalHeight = 0;
  const rowHeights = data.rows.map((_, r) => (r === 0 ? 8.0 : 6.0));
  totalHeight = rowHeights.reduce((sum, v) => sum + v, 0);

  const startX = data.insertionPointMm[0];
  const startY = data.insertionPointMm[1];

  // Outer border & horizontal grid lines
  let currentY = startY;
  for (let r = 0; r <= data.rows.length; r++) {
    const handleHex = (h++).toString(16).toUpperCase();
    lines.push(
      "  0",
      "LINE",
      "  5",
      handleHex,
      "330",
      ownerHandle,
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      spaceFlag,
      "100",
      "AcDbLine",
      " 10",
      startX.toFixed(3),
      " 20",
      currentY.toFixed(3),
      " 30",
      "0.000",
      " 11",
      (startX + totalWidth).toFixed(3),
      " 21",
      currentY.toFixed(3),
      " 31",
      "0.000",
    );
    if (r < data.rows.length) {
      currentY -= rowHeights[r];
    }
  }

  // Vertical grid lines
  let currentX = startX;
  for (let c = 0; c <= data.columns.length; c++) {
    const handleHex = (h++).toString(16).toUpperCase();
    lines.push(
      "  0",
      "LINE",
      "  5",
      handleHex,
      "330",
      ownerHandle,
      "100",
      "AcDbEntity",
      "  8",
      layer,
      " 67",
      spaceFlag,
      "100",
      "AcDbLine",
      " 10",
      currentX.toFixed(3),
      " 20",
      startY.toFixed(3),
      " 30",
      "0.000",
      " 11",
      currentX.toFixed(3),
      " 21",
      (startY - totalHeight).toFixed(3),
      " 31",
      "0.000",
    );
    if (c < data.columns.length) {
      currentX += data.columns[c].widthMm;
    }
  }

  // Cell texts
  let cellY = startY;
  for (let r = 0; r < data.rows.length; r++) {
    const row = data.rows[r];
    const rh = rowHeights[r];
    let cellX = startX;
    const textHeight = r === 0 ? 3.0 : 2.4;

    for (let c = 0; c < data.columns.length; c++) {
      const cell = row[c];
      const colW = data.columns[c].widthMm;
      if (cell && cell.text) {
        const handleHex = (h++).toString(16).toUpperCase();
        const tx = cell.alignment === "center"
          ? cellX + colW / 2
          : cell.alignment === "right"
            ? cellX + colW - 2
            : cellX + 2;
        const ty = cellY - rh / 2 - textHeight / 3;

        lines.push(
          "  0",
          "TEXT",
          "  5",
          handleHex,
          "330",
          ownerHandle,
          "100",
          "AcDbEntity",
          "  8",
          layer,
          " 67",
          spaceFlag,
          "100",
          "AcDbText",
          " 10",
          tx.toFixed(3),
          " 20",
          ty.toFixed(3),
          " 30",
          "0.000",
          " 40",
          textHeight.toFixed(3),
          "  1",
          cell.text,
          "  7",
          "STANDARD",
        );
        if (cell.alignment === "center") {
          lines.push(
            " 72",
            "1", // Center alignment
            " 11",
            tx.toFixed(3),
            " 21",
            ty.toFixed(3),
            " 31",
            "0.000",
          );
        } else if (cell.alignment === "right") {
          lines.push(
            " 72",
            "2", // Right alignment
            " 11",
            tx.toFixed(3),
            " 21",
            ty.toFixed(3),
            " 31",
            "0.000",
          );
        }
      }
      cellX += colW;
    }
    cellY -= rh;
  }

  return {
    dxf: lines.join("\n") + "\n",
    nextHandle: h,
  };
}
