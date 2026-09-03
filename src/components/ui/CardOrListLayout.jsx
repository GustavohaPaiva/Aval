import { useListView } from '../../contexts/ListViewContext'

/**
 * When list view is enabled (gestor, desktop preference), cards stay visible
 * only below `lg` and the list/table slot is shown from `lg` up.
 * When disabled, only the cards slot is rendered (current default).
 *
 * @param {{
 *   cards: import('react').ReactNode,
 *   list: import('react').ReactNode,
 *   cardsClassName?: string,
 * }} props
 */
export function CardOrListLayout({ cards, list, cardsClassName = '' }) {
  const { enabled } = useListView()

  if (!enabled) {
    return cards
  }

  return (
    <>
      <div className={['lg:hidden', cardsClassName].filter(Boolean).join(' ')}>
        {cards}
      </div>
      {list}
    </>
  )
}
