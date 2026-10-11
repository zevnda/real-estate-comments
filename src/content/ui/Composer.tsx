import type { CommentView } from '../../shared/messages'
import type { PropertyInput } from '../../shared/property'

import { useEffect, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { COMMENT_MAX_LENGTH, USERNAME_MAX_LENGTH, validateCommentText } from '../../shared/validation'
import { errorMessage, useStored } from '../hooks'
import { Dialog } from './Dialog'
import { FormattingHelp } from './FormattingHelp'
import { POSTING_RULES } from './Legal'

interface ComposerProps {
  property: PropertyInput
  onPosted: (comment: CommentView) => void
}

export function Composer({ property, onPosted }: ComposerProps) {
  const [text, setText] = useState('')
  const [savedName, saveName] = useStored('displayName', '')
  const [name, setName] = useState('')
  const [showTerms, setShowTerms] = useState(false)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setName(savedName), [savedName])

  // A draft belongs to the property it was written for. Don't carry it over to the next listing.
  useEffect(() => {
    setText('')
    setError(null)
    setTouched(false)
    setShowTerms(false)
  }, [property.url, property.address])

  // Grow the textarea with its content, up to the CSS max-height
  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [text])

  const length = text.trim().length
  const invalid = validateCommentText(text)

  const submit = async () => {
    setPosting(true)
    setError(null)
    try {
      const comment = await callBackground('createComment', { property, text, username: name })
      if (name.trim() !== savedName) saveName(name.trim())
      setText('')
      setTouched(false)
      onPosted(comment)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  const post = () => {
    setTouched(true)
    if (invalid || posting) return
    // Every post is agreed to separately, so the rules are fresh in mind each time
    setShowTerms(true)
  }

  const acceptTerms = () => {
    setShowTerms(false)
    void submit()
  }

  return (
    <form
      class='composer'
      onSubmit={event => {
        event.preventDefault()
        post()
      }}
    >
      <label class='visually-hidden' for='rec-name'>
        Your name
      </label>
      <input
        id='rec-name'
        type='text'
        value={name}
        maxLength={USERNAME_MAX_LENGTH}
        placeholder='Your name (optional)'
        autoComplete='nickname'
        onInput={event => setName(event.currentTarget.value)}
      />
      <label class='visually-hidden' for='rec-comment'>
        Your comment
      </label>
      <textarea
        id='rec-comment'
        ref={textarea}
        value={text}
        rows={3}
        maxLength={COMMENT_MAX_LENGTH + 200}
        placeholder='Lived here, inspected it, or know the area? Share what it’s really like…'
        onInput={event => setText(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            post()
          }
        }}
        aria-invalid={touched && !!invalid}
        aria-describedby='rec-composer-hint'
      />
      <div class='composer-row'>
        <p id='rec-composer-hint' class='composer-hint'>
          {touched && invalid ? (
            <span class='inline-error'>{invalid}</span>
          ) : (
            <>
              <button type='button' class='link-button' onClick={() => setShowHelp(true)}>
                Formatting help
              </button>
              <span aria-hidden='true'> · </span>
              Ctrl+Enter to post
            </>
          )}
        </p>
        <span class={`counter${length > COMMENT_MAX_LENGTH ? ' counter--over' : ''}`} aria-live='polite'>
          {length}/{COMMENT_MAX_LENGTH}
        </span>
        <button type='submit' class='button button--primary' disabled={posting}>
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
      {error && (
        <p class='inline-error' role='alert'>
          {error}
        </p>
      )}
      {showTerms && (
        <Dialog id='rec-terms-title' title='Before you post' class='terms' onClose={() => setShowTerms(false)}>
          <p class='dialog-intro'>Comments are public. Please confirm your comment follows these rules:</p>
          <ul>
            {POSTING_RULES.map(rule => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <div class='terms-actions'>
            <button type='button' class='button button--ghost' onClick={() => setShowTerms(false)}>
              Cancel
            </button>
            <button type='button' class='button button--primary' onClick={acceptTerms} data-autofocus>
              I agree, post comment
            </button>
          </div>
        </Dialog>
      )}
      {showHelp && (
        <FormattingHelp
          onClose={() => {
            setShowHelp(false)
            textarea.current?.focus()
          }}
        />
      )}
    </form>
  )
}
