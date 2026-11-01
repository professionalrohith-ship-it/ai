/** Chrome's zoom presets. Snapping to them keeps the correction stable while the window resizes. */
const ZOOM_STEPS = [1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5]

/** Browser page zoom, read as outerWidth (device-independent px, unaffected by zoom) / innerWidth (CSS px). */
function detectPageZoom(): number {
  if (!window.innerWidth || !window.outerWidth) return 1
  const ratio = window.outerWidth / window.innerWidth
  return ZOOM_STEPS.reduce((best, step) => (Math.abs(step - ratio) < Math.abs(best - ratio) ? step : best), 1)
}

/** Keeps the UI at its designed size when the browser is zoomed in, so it stays a laptop-sized web app
 *  instead of rendering as a few giant icons. --zf is the inverse zoom, used by full-height layouts. */
export function applyZoomCompensation() {
  const update = () => {
    const factor = 1 / detectPageZoom()
    document.documentElement.style.setProperty('--zf', String(factor))
    document.documentElement.style.setProperty('zoom', String(factor))
  }
  update()
  window.addEventListener('resize', update)
}
