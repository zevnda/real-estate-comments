import { useLayoutEffect, useRef } from 'preact/hooks'

import { renderMarkdown } from '../markdown'

export function Markdown({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    ref.current?.replaceChildren(renderMarkdown(text))
  }, [text])
  return <div class='markdown' ref={ref} />
}
