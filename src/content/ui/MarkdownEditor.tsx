import type { Ref } from 'preact'

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { COMMENT_MAX_LENGTH } from '../../shared/validation'
import { commentImages } from '../markdown'
import { CommentImages } from './Images'
import { Markdown } from './Markdown'

interface MarkdownEditorProps {
  id: string
  label: string
  value: string
  onInput: (value: string) => void
  placeholder?: string
  textareaRef?: Ref<HTMLTextAreaElement>
  onKeyDown?: (event: KeyboardEvent) => void
  invalid?: boolean
  describedBy?: string
  // Changing this goes back to Write (after posting)
  resetKey?: number
}

// A comment text box with Write and Preview tabs, like GitHub's. The preview is rendered by the same code as posted
// comments, image thumbnails included, so it shows exactly what will appear.
export function MarkdownEditor(props: MarkdownEditorProps) {
  const { id, label, value, onInput, placeholder, textareaRef, onKeyDown, invalid, describedBy, resetKey } = props
  const [previewing, setPreviewing] = useState(false)
  // The text box's height when Preview was chosen. The preview takes exactly that height (scrolling if it's longer),
  // so switching tabs never makes the panel jump.
  const [previewHeight, setPreviewHeight] = useState<number | undefined>()
  const ownRef = useRef<HTMLTextAreaElement>(null)
  const images = useMemo(() => (previewing ? commentImages(value) : []), [previewing, value])

  const setRef = (element: HTMLTextAreaElement | null) => {
    ownRef.current = element
    if (typeof textareaRef === 'function') textareaRef(element)
    else if (textareaRef) textareaRef.current = element
  }

  // Grow the textarea with its content, up to the CSS max-height. Measured again after the preview, while which it's
  // hidden.
  useEffect(() => {
    const element = ownRef.current
    if (!element || previewing) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value, previewing])

  useEffect(() => setPreviewing(false), [resetKey])

  // Back to writing: the text box was hidden, so give it focus again
  const write = () => {
    setPreviewing(false)
    setTimeout(() => ownRef.current?.focus(), 0)
  }

  const preview = () => {
    if (!previewing) setPreviewHeight(ownRef.current?.offsetHeight)
    setPreviewing(true)
  }

  return (
    <div class={`editor${previewing ? ' editor--previewing' : ''}`}>
      <div class='editor-tabs' role='tablist' aria-label={`${label}: write or preview`}>
        <button type='button' role='tab' aria-selected={!previewing} onClick={write}>
          Write
        </button>
        <button type='button' role='tab' aria-selected={previewing} onClick={preview}>
          Preview
        </button>
      </div>
      <label class='visually-hidden' for={id}>
        {label}
      </label>
      <textarea
        id={id}
        ref={setRef}
        value={value}
        rows={3}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder={placeholder}
        hidden={previewing}
        onInput={event => onInput(event.currentTarget.value)}
        onKeyDown={onKeyDown}
        aria-invalid={invalid}
        aria-describedby={describedBy}
      />
      {previewing && (
        <div
          class='editor-preview'
          role='tabpanel'
          aria-label='Preview'
          style={previewHeight ? { height: `${previewHeight}px` } : undefined}
        >
          {value.trim() ? (
            <>
              <Markdown text={value} />
              {images.length > 0 && <CommentImages images={images} size='xs' />}
            </>
          ) : (
            <p class='editor-empty'>Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
