// DOM coordinates use the renderer's CSS pixels, not its device-pixel resolution.
export function sceneTransform(matrix, dimensions, rendererRect, overlayRect) {
  const { a, b, c, d, tx, ty } = matrix;
  const { sceneX = 0, sceneY = 0 } = dimensions;
  return {
    a, b, c, d,
    tx: tx + a * sceneX + c * sceneY + rendererRect.left - overlayRect.left,
    ty: ty + b * sceneX + d * sceneY + rendererRect.top - overlayRect.top
  };
}

export function scenePoint(matrix, dimensions, rendererRect, x, y) {
  const { a, b, c, d, tx, ty } = matrix;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || determinant === 0) throw new Error("Invalid canvas transform");
  const dx = x - rendererRect.left - tx, dy = y - rendererRect.top - ty;
  return {
    x: ((d * dx - c * dy) / determinant - (dimensions.sceneX ?? 0)) / dimensions.sceneWidth,
    y: ((a * dy - b * dx) / determinant - (dimensions.sceneY ?? 0)) / dimensions.sceneHeight
  };
}
