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

export function fitSceneView(dimensions, renderer, layout, leftBand, rightBand) {
  const left = Math.max(renderer.left, layout.left, leftBand.right);
  const right = Math.min(renderer.left + renderer.width, layout.right, rightBand.left);
  const top = Math.max(renderer.top, layout.top);
  const bottom = Math.min(renderer.top + renderer.height, layout.bottom);
  const width = right - left, height = bottom - top;
  if (![width, height, dimensions.sceneWidth, dimensions.sceneHeight].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("Invalid map viewport dimensions");
  }
  const scale = Math.min(width / dimensions.sceneWidth, height / dimensions.sceneHeight) * 0.96;
  return {
    x: (dimensions.sceneX ?? 0) + dimensions.sceneWidth / 2 -
      ((left + right) / 2 - (renderer.left + renderer.width / 2)) / scale,
    y: (dimensions.sceneY ?? 0) + dimensions.sceneHeight / 2 -
      ((top + bottom) / 2 - (renderer.top + renderer.height / 2)) / scale,
    scale
  };
}
