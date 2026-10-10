import type { ComponentChildren } from 'preact'

import { RefreshIcon } from './icons'

// Empty, error and loading states shared by the panel's tabs

export function Notice({
  icon,
  title,
  children,
}: {
  icon: ComponentChildren
  title: string
  children?: ComponentChildren
}) {
  return (
    <div class='notice'>
      <div class='notice-icon'>{icon}</div>
      <p class='notice-title'>{title}</p>
      {children && <div class='notice-body'>{children}</div>}
    </div>
  )
}

export function ErrorNotice({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div class='notice notice--error' role='alert'>
      <p class='notice-title'>Couldn’t load comments</p>
      <p class='notice-body'>{error}</p>
      <button type='button' class='button button--ghost' onClick={onRetry}>
        <RefreshIcon />
        Try again
      </button>
    </div>
  )
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div class='skeleton-list' aria-busy='true' aria-label={label}>
      {[0, 1, 2].map(i => (
        <div class='skeleton' key={i}>
          <div class='skeleton-avatar' />
          <div class='skeleton-lines'>
            <div class='skeleton-line skeleton-line--short' />
            <div class='skeleton-line' />
            <div class='skeleton-line skeleton-line--medium' />
          </div>
        </div>
      ))}
    </div>
  )
}
