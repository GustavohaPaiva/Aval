import { NavLink } from 'react-router-dom'
import { COMPRAS_NAV } from '../../constants/compras'

export function ComprasSubnav() {
  return (
    <nav
      aria-label="Compras"
      className="mb-6 flex flex-wrap gap-1 rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70"
    >
      {COMPRAS_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              'min-h-10 flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold transition-colors',
              isActive
                ? 'bg-white text-primary-800 shadow-sm ring-1 ring-slate-200/80'
                : 'text-slate-600 hover:text-slate-900',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
