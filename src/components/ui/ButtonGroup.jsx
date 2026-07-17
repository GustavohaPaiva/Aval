import { Children, cloneElement, isValidElement } from 'react'

const alignClass = {
  end: 'sm:justify-end',
  stretch: 'sm:justify-stretch',
  start: 'sm:justify-start',
}

export function ButtonGroup({
  children,
  align = 'stretch',
  className = '',
}) {
  const items = Children.toArray(children).filter(Boolean)

  return (
    <div
      className={[
        'flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center',
        alignClass[align] ?? alignClass.stretch,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {items.map((child, index) => {
        if (!isValidElement(child)) return child
        return cloneElement(child, {
          key: child.key ?? index,
          className: [
            'w-full sm:flex-1',
            child.props.className ?? '',
          ]
            .filter(Boolean)
            .join(' '),
        })
      })}
    </div>
  )
}
