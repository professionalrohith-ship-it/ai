import { useRef, type PointerEvent, type ReactNode } from 'react'
import './GlassButton.css'

const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface GlassButtonProps {
  children: ReactNode
  onClick?: () => void
}

function GlassButton({ children, onClick }: GlassButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null)

  // Nudge toward the pointer and let a highlight follow it across the glass.
  const handleMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduceMotion()) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const el = wrapRef.current
    if (!el) return
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    el.style.setProperty('--tx', `${(px - 0.5) * 8}px`)
    el.style.setProperty('--ty', `${(py - 0.5) * 6}px`)
  }

  const handleLeave = () => {
    const el = wrapRef.current
    if (!el) return
    el.style.setProperty('--mx', '50%')
    el.style.setProperty('--my', '50%')
    el.style.setProperty('--tx', '0px')
    el.style.setProperty('--ty', '0px')
  }

  // Ripple that spreads from the point of the press.
  const handleDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (reduceMotion()) return
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 1.6
    const ripple = document.createElement('span')
    ripple.className = 'gb-ripple'
    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`
    ripple.addEventListener('animationend', () => ripple.remove())
    btn.appendChild(ripple)
  }

  return (
    <div className="gb" ref={wrapRef}>
      <span className="gb-aura" aria-hidden="true" />
      <span className="gb-ring" aria-hidden="true" />
      <span className="gb-ring gb-ring-2" aria-hidden="true" />
      <button
        type="button"
        className="gb-btn"
        onClick={onClick}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onPointerDown={handleDown}
      >
        <span className="gb-orbit" aria-hidden="true" />
        <span className="gb-sheen" aria-hidden="true" />
        <span className="gb-label">{children}</span>
        <svg className="gb-arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4.5 12h14M13 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <span className="gb-spark gb-spark-1" aria-hidden="true" />
      <span className="gb-spark gb-spark-2" aria-hidden="true" />
      <span className="gb-spark gb-spark-3" aria-hidden="true" />
      <span className="gb-spark gb-spark-4" aria-hidden="true" />
      <span className="gb-spark gb-spark-5" aria-hidden="true" />
    </div>
  )
}

export default GlassButton
