import type { Ref } from 'preact'

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'

import { COMMENT_MAX_LENGTH } from '../../shared/validation'
import { commentImages } from '../markdown'
import { AddImage } from './AddImage'
import { ImageIcon } from './icons'
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
  const [addingImage, setAddingImage] = useState(false)
  // Shown after an image file is pasted: we can't upload it, so point to the image helper
  const [pastedFile, setPastedFile] = useState(false)
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

  // Adds the image's link where the cursor was (on its own line), and goes back to the text
  const insertImage = (markdown: string) => {
    const element = ownRef.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const text = `${before && !before.endsWith('\n') ? '\n' : ''}${markdown}\n`
    onInput(before + text + value.slice(end))
    setAddingImage(false)
    setPastedFile(false)
    setPreviewing(false)
    setTimeout(() => {
      element?.focus()
      element?.setSelectionRange(start + text.length, start + text.length)
    }, 0)
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
        <button
          type='button'
          class='editor-image'
          onClick={() => setAddingImage(!addingImage)}
          aria-expanded={addingImage}
          title='Add an image'
        >
          <ImageIcon size={15} />
          Add image
        </button>
      </div>
      {addingImage && <AddImage onAdd={insertImage} onClose={() => setAddingImage(false)} />}
      {pastedFile && !addingImage && (
        <p class='editor-hint'>
          Images can’t be pasted in directly.{' '}
          <button type='button' class='link-button' onClick={() => setAddingImage(true)}>
            Add an image
          </button>{' '}
          by uploading it to an image host first.
        </p>
      )}
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
        onPaste={event => {
          if (
            [...(event.clipboardData?.items ?? [])].some(item => item.kind === 'file' && item.type.startsWith('image/'))
          ) {
            setPastedFile(true)
          }
        }}
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
