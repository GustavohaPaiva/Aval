import logoFull from '../../assets/logo-aval.png'
import logoMark from '../../assets/logo-aval-mark.png'

/**
 * Símbolo Aval (A com check) — uso em sidebar, favicon-like e loading.
 */
export function BrandMark({ className = 'size-8', alt = 'Aval' }) {
  return (
    <img
      src={logoMark}
      alt={alt}
      className={['object-contain', className].filter(Boolean).join(' ')}
      draggable={false}
    />
  )
}

/**
 * Logo completa (símbolo + wordmark). Preferir fundos escuros —
 * o texto do asset é branco.
 */
export function BrandLogoFull({ className = 'h-10 w-auto', alt = 'Aval' }) {
  return (
    <img
      src={logoFull}
      alt={alt}
      className={['object-contain', className].filter(Boolean).join(' ')}
      draggable={false}
    />
  )
}
