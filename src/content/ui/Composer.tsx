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

interface ComposerProps {
  property: PropertyInput
  // The comment being replied to, chosen with its Reply button
  replyTo: CommentView | null
  onCancelReply: () => void
  onPosted: (comment: CommentView) => void
}

export function Composer({ property, replyTo, onCancelReply, onPosted }: ComposerProps) {
  const [text, setText] = useState('')
  const [savedName, saveName] = useStored('displayName', '')
  const [name, setName] = useState('')
  const [showTerms, setShowTerms] = useState(false)
  const rules = usePostingRules()
  // Incremented after each post, which puts the editor back on Write
  const [posts, setPosts] = useState(0)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setName(savedName), [savedName])

  // A draft belongs to the property it was written for. Don't carry it over to the next listing. Only on an actual
  // change: clearing on mount too (e.g. switching back to the Property tab) wiped anything typed in the first moment.
  const propertyKey = `${property.url}|${property.address}`
  const draftFor = useRef(propertyKey)
  useEffect(() => {
    if (draftFor.current === propertyKey) return
    draftFor.current = propertyKey
    setText('')
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
      setText('')
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
        onInput={event => setName(event.currentTarget.value)}
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
