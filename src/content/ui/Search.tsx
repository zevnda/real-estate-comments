import type { CommentView, SearchResult } from '../../shared/messages'
import type { Loadable } from '../hooks'
import type { ResultsView } from '../views'

import { useEffect, useRef, useState } from 'preact/hooks'

import { callBackground } from '../../shared/messages'
import { parseSearchQuery } from '../../shared/search'
import { formatRelative, pluralize } from '../format'
import { errorMessage } from '../hooks'
import { RESULT_VIEWS, viewResults } from '../views'
import { DetailComments } from './DetailComments'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ImageIcon, SearchIcon } from './icons'
import { PropertyLinks } from './PropertyLinks'
import { Notice, Skeleton } from './states'
import { ViewSelect } from './ViewSelect'
import { WatchButton, watchEntry } from './Watchlist'

const DEBOUNCE_MS = 300

// Search existing comments by address, without opening the property's listing. The query lives in the panel so it
// survives switching tabs.
export function SearchTab({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  const [state, setState] = useState<Loadable<SearchResult[]>>({ status: 'idle' })
  const [openId, setOpenId] = useState<string | null>(null)
  const latestRequest = useRef(0)
  const trimmed = query.trim()
  // Too short to search (e.g. a single letter)
  const searchable = parseSearchQuery(trimmed) !== null

  useEffect(() => {
    const request = ++latestRequest.current
    if (!searchable) {
      setState({ status: 'idle' })
      return
    }
    // Keep showing the previous results while the user types
    setState(previous => (previous.status === 'ready' ? previous : { status: 'loading' }))
    const timer = setTimeout(() => {
      callBackground('searchComments', { query: trimmed }).then(
        data => request === latestRequest.current && setState({ status: 'ready', data }),
        (error: unknown) =>
          request === latestRequest.current && setState({ status: 'error', error: errorMessage(error) }),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed, searchable])

  const [resultsView, setResultsView] = useState<ResultsView>('match')
  const input = useRef<HTMLInputElement>(null)
  const results = state.status === 'ready' ? state.data : []

  const clear = () => {
    onQuery('')
    setOpenId(null)
    input.current?.focus()
  }
  const shown = viewResults(results, resultsView)
  const open = results.find(result => result.id === openId) ?? null

  const updateComments = (id: string, change: (comments: CommentView[]) => CommentView[]) =>
    setState(previous =>
      previous.status === 'ready'
        ? {
            status: 'ready',
            data: previous.data.map(result =>
              result.id === id ? { ...result, comments: change(result.comments) } : result,
            ),
          }
        : previous,
    )

  if (open) {
    return (
      <div class='search-detail'>
        <button type='button' class='text-button back-button' onClick={() => setOpenId(null)}>
          <ChevronLeftIcon />
          All results
        </button>
        <div class='search-detail-heading'>
          <div class='detail-title'>
            <h3>{open.displayAddress}</h3>
            {open.property && (
              <WatchButton
                entry={watchEntry(open.property, open.displayAddress, open.displayLocality)}
                newestAt={open.latestAt}
                variant='text'
              />
            )}
          </div>
          <p>{open.displayLocality}</p>
          <PropertyLinks links={open.links} />
        </div>
        <DetailComments comments={open.comments} onUpdate={change => updateComments(open.id, change)} />
      </div>
    )
  }

  return (
    <div class='search'>
      <form
        class='search-box'
        role='search'
        onSubmit={event => {
          event.preventDefault()
          if (results.length === 1) setOpenId(results[0]!.id)
        }}
      >
        <SearchIcon />
        <label class='visually-hidden' for='rec-search'>
          Search by address
        </label>
        <input
          id='rec-search'
          ref={input}
          type='search'
          value={query}
          placeholder='Address, street, suburb or postcode'
          autoComplete='off'
          spellcheck={false}
          // The user just chose this tab to type into it
          autoFocus
          onInput={event => {
            onQuery(event.currentTarget.value)
            setOpenId(null)
          }}
          onKeyDown={event => {
            // Esc clears the search first; with nothing to clear, it closes the panel as usual
            if (event.key === 'Escape' && query) {
              event.stopPropagation()
              clear()
            }
          }}
        />
        {query && (
          <button type='button' class='search-clear' onClick={clear} aria-label='Clear search' title='Clear search'>
            <CloseIcon />
          </button>
        )}
      </form>

      {state.status === 'idle' ? (
        <Notice icon={<SearchIcon size={20} />} title='Search comments'>
          Search by address, street, suburb, state, or postcode, e.g. “123 Main Street, Sydney”, “Main Street”,
          “Sydney”, "NSW", "2000".
        </Notice>
      ) : state.status === 'loading' ? (
        <Skeleton label='Searching…' />
      ) : state.status === 'error' ? (
        <p class='search-hint inline-error' role='alert'>
          {state.error}
        </p>
      ) : results.length === 0 ? (
        <Notice icon={<SearchIcon size={20} />} title='No comments found'>
          Nobody has commented on a property matching that yet. Check the spelling, or try fewer words.
        </Notice>
      ) : (
        <>
          <div class='list-toolbar'>
            <span>{pluralize(results.length, 'property', 'properties')}</span>
            <ViewSelect
              label='Sort or filter results'
              value={resultsView}
              options={RESULT_VIEWS}
              onChange={setResultsView}
            />
          </div>
          {shown.length === 0 && (
            <Notice icon={<ImageIcon />} title='No results with photos'>
              <button type='button' class='button button--ghost' onClick={() => setResultsView('match')}>
                Show all results
              </button>
            </Notice>
          )}
          <ul class='search-results' aria-label='Properties with comments'>
            {shown.map(result => (
              <li key={result.id}>
                <button type='button' class='search-result' onClick={() => setOpenId(result.id)}>
                  <span class='search-result-main'>
                    <span class='search-result-address'>{result.displayAddress}</span>
                    <span class='search-result-locality'>{result.displayLocality}</span>
                  </span>
                  <span class='search-result-meta'>
                    {pluralize(result.comments.length, 'comment')}
                    <span>{formatRelative(result.latestAt)}</span>
                  </span>
                  <ChevronRightIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
