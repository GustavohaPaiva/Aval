import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Button } from '../ui/Button'

/**
 * Canvas de assinatura manuscrita (mouse + touch).
 */
export const SignaturePad = forwardRef(function SignaturePad(
  { onChange, disabled = false, className = '' },
  ref,
) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const lastRef = useRef(null)
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const setup = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(280, Math.floor(rect.width))
      const height = 160
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2.2
    }

    setup()
    window.addEventListener('resize', setup)
    return () => window.removeEventListener('resize', setup)
  }, [])

  function notifyInk(next) {
    hasInkRef.current = next
    setHasInk(next)
    onChange?.(next)
  }

  function getPoint(event) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const source =
      'touches' in event
        ? event.touches[0] || event.changedTouches?.[0]
        : event
    if (!source) return null
    return {
      x: source.clientX - rect.left,
      y: source.clientY - rect.top,
    }
  }

  function startDraw(event) {
    if (disabled) return
    event.preventDefault()
    const point = getPoint(event)
    if (!point) return
    drawingRef.current = true
    lastRef.current = point
  }

  function moveDraw(event) {
    if (disabled || !drawingRef.current) return
    event.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const point = getPoint(event)
    const last = lastRef.current
    if (!ctx || !point || !last) return
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastRef.current = point
    if (!hasInkRef.current) notifyInk(true)
  }

  function endDraw(event) {
    if (!drawingRef.current) return
    event.preventDefault()
    drawingRef.current = false
    lastRef.current = null
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.2
    notifyInk(false)
  }

  useImperativeHandle(ref, () => ({
    clear,
    hasInk: () => hasInkRef.current,
    toDataUrl: () => {
      const canvas = canvasRef.current
      if (!canvas || !hasInkRef.current) return null
      return canvas.toDataURL('image/png')
    },
    toPngBlob: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current
        if (!canvas || !hasInkRef.current) {
          resolve(null)
          return
        }
        canvas.toBlob((blob) => resolve(blob), 'image/png')
      }),
  }))

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white touch-none">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Assine com o dedo ou o mouse na área acima.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="px-3! py-1.5! text-xs"
          disabled={disabled || !hasInk}
          onClick={clear}
        >
          Limpar
        </Button>
      </div>
    </div>
  )
})
