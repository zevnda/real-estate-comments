import type { CommentView } from '../../shared/messages'
import type { PropertyInput } from '../../shared/property'

import { useEffect, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { COMMENT_MAX_LENGTH, USERNAME_MAX_LENGTH, validateCommentText } from '../../shared/validation'
import { errorMessage, useStored } from '../hooks'
import { excerpt } from '../threads'
import { FormattingHelp } from './FormattingHelp'
import { CloseIcon, ReplyIcon } from './icons'
import { PostingRulesDialog, usePostingRules } from './Legal'
import { MarkdownEditor } from './MarkdownEditor'

// What's typed in the composer. Kept by App, so it survives closing the panel (which unmounts it).
export interface Draft {
  text: string
  // null until the user types a name: shows the saved one
  name: string | null
  // The comment being replied to, chosen with its Reply button
  replyTo: CommentView | null
}

export const EMPTY_DRAFT: Draft = { text: '', name: null, replyTo: null }

interface ComposerProps {
  property: PropertyInput
  draft: Draft
  onDraft: (change: Partial<Draft>) => void
  onPosted: (comment: CommentView) => void
}

export function Composer({ property, draft, onDraft, onPosted }: ComposerProps) {
  const { text, replyTo } = draft
  const setText = (value: string) => onDraft({ text: value })
  const onCancelReply = () => onDraft({ replyTo: null })
  const [savedName, saveName] = useStored('displayName', '')
  const name = draft.name ?? savedName
  const [showTerms, setShowTerms] = useState(false)
  const rules = usePostingRules()
  // Incremented after each post, which puts the editor back on Write
  const [posts, setPosts] = useState(0)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  // App clears the draft on the next listing; clear what's left of the last attempt too. Only on an actual change,
  // not on mount (e.g. switching back to the Property tab).
  const propertyKey = draftKey(property)
  const draftFor = useRef(propertyKey)
  useEffect(() => {
    if (draftFor.current === propertyKey) return
    draftFor.current = propertyKey
    setError(null)
    setTouched(false)
    setShowTerms(false)
  }, [propertyKey])

  // Choosing Reply takes you to the text box
  useEffect(() => {
    if (replyTo) textarea.current?.focus()
  }, [replyTo?.id])

  const length = text.trim().length
  const invalid = validateCommentText(text)

  const submit = async () => {
    setPosting(true)
    setError(null)
    try {
      const comment = await callBackground('createComment', {
        property,
        text,
        username: name,
        ...(replyTo && { replyTo: replyTo.id }),
      })
      if (name.trim() !== savedName) saveName(name.trim())
      onDraft({ text: '', name: null })
      setTouched(false)
      setPosts(count => count + 1)
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
    if (rules.needed) setShowTerms(true)
    else void submit()
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
        onInput={event => onDraft({ name: event.currentTarget.value })}
      />
      {replyTo && (
        <div class='reply-bar'>
          <ReplyIcon />
          <span class='reply-bar-text'>
            Replying to <strong>{replyTo.username}</strong>
            <span class='reply-bar-excerpt'>{excerpt(replyTo.text)}</span>
          </span>
          <button
            type='button'
            class='icon-button icon-button--small'
            onClick={onCancelReply}
            aria-label='Cancel reply'
          >
            <CloseIcon />
          </button>
        </div>
      )}
      <MarkdownEditor
        id='rec-comment'
        label={replyTo ? `Reply to ${replyTo.username}` : 'Your comment'}
        value={text}
        onInput={setText}
        textareaRef={textarea}
        placeholder={
          replyTo ? 'Write a reply…' : 'Lived here, inspected it, or know the area? Share what it’s really like…'
        }
        invalid={touched && !!invalid}
        describedBy='rec-composer-hint'
        resetKey={posts}
        onKeyDown={event => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            post()
          } else if (event.key === 'Escape' && replyTo) {
            // Cancel the reply rather than close the panel
            event.stopPropagation()
            onCancelReply()
          }
        }}
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
          {posting ? 'Posting…' : replyTo ? 'Reply' : 'Post'}
        </button>
      </div>
      {error && (
        <p class='inline-error' role='alert'>
          {error}
        </p>
      )}
      {showTerms && (
        <PostingRulesDialog
          agreeLabel={replyTo ? 'I agree, post reply' : 'I agree, post comment'}
          onCancel={() => setShowTerms(false)}
          onAgree={() => {
            setShowTerms(false)
            rules.accept()
            void submit()
          }}
        />
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

// A draft belongs to the property it was written for
export function draftKey(property: PropertyInput): string {
  return `${property.url}|${property.address}`
}
