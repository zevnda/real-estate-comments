import type { ComponentChildren } from 'preact'

import { useLayoutEffect, useRef } from 'preact/hooks'

import { CloseIcon } from './icons'

interface DialogProps {
  id: string
  title: string
  // Extra class on the dialog box, for its contents' styles
  class?: string
  onClose: () => void
  children: ComponentChildren
}

// A dialog over the panel, with a backdrop. Closes on the backdrop, the close button or Esc.
export function Dialog({ id, title, class: className, onClose, children }: DialogProps) {
  const box = useRef<HTMLDivElement>(null)
  // Before paint, so Esc pressed straight away reaches the dialog rather than closing the panel
  useLayoutEffect(() => {
    const element = box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current?.querySelector('button')
    element?.focus()
  }, [])

  return (
    <div
      class='overlay'
      onClick={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          // Close only this dialog, not the whole panel
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        ref={box}
        class={`dialog${className ? ` ${className}` : ''}`}
        role='dialog'
        aria-modal='true'
        aria-labelledby={id}
      >
        <header class='dialog-header'>
          <h3 id={id}>{title}</h3>
          <button type='button' class='icon-button' onClick={onClose} aria-label='Close'>
            <CloseIcon />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
