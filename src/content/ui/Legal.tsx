import { useStored } from '../hooks'
import { COMPLAINTS_EMAIL, complaintsMailto } from '../report'
import { Dialog } from './Dialog'

// Shown before every post, and repeated in the terms of use. Written to keep comments to the property and the
// area and away from claims about identifiable people, which is where the defamation and privacy risk is.
export const POSTING_RULES = [
  'Keep it about the property, the building or the area. If you’re passing on someone else’s experience, say so.',
  'Stick to facts you could back up, and make it clear when something is your opinion.',
  'Don’t name or identify private individuals: landlords, owners, agents, tenants, neighbours or anyone living there.',
  // Describing what happened is what keeps a bad review safe; labels and accusations are what get sued over
  'Both positive and negative experiences are welcome. Describe what happened (“our bond took three months to come back”) rather than labelling people (“the agent is a crook”).',
  'Nothing defamatory, harassing, threatening or discriminatory.',
  'Don’t post personal information (names, phone numbers, emails), private conversations or documents.',
  'No spam, advertising or irrelevant content, and nothing that breaks the law.',
  'Your comment is public. You’re responsible for it, and it may be removed without notice.',
]

const UPDATED = '14 October 2026'

// Bump when the posting rules change in substance, so everyone agrees to the new ones before their next post
export const POSTING_RULES_VERSION = 1

// Whether the user still has to agree to the posting rules (before their first post, reply or edit, and again after
// the rules change). Until storage has been read, assume they do.
export function usePostingRules(): { needed: boolean; accept: () => void } {
  const [accepted, save, loaded] = useStored('postingRulesAccepted', 0)
  return { needed: !loaded || accepted < POSTING_RULES_VERSION, accept: () => save(POSTING_RULES_VERSION) }
}

// Shown before the user's first post, reply or edit (see usePostingRules)
export function PostingRulesDialog({
  agreeLabel,
  onCancel,
  onAgree,
}: {
  agreeLabel: string
  onCancel: () => void
  onAgree: () => void
}) {
  return (
    <Dialog id='rec-terms-title' title='Before you post' class='terms' onClose={onCancel}>
      <p class='dialog-intro'>Comments are public. Please confirm your comment follows these rules:</p>
      <ul>
        {POSTING_RULES.map(rule => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <div class='terms-actions'>
        <button type='button' class='button button--ghost' onClick={onCancel}>
          Cancel
        </button>
        <button type='button' class='button button--primary' onClick={onAgree} data-autofocus>
          {agreeLabel}
        </button>
      </div>
    </Dialog>
  )
}

const ComplaintsLink = () => <a href={complaintsMailto()}>{COMPLAINTS_EMAIL}</a>

export function TermsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog id='rec-terms-of-use-title' title='Terms of use' class='legal' onClose={onClose}>
      <p class='dialog-intro'>Last updated {UPDATED}</p>
      <p>
        Real Estate Comments is a free, independent browser extension that lets people share comments about properties
        listed on realestate.com.au, domain.com.au and other property sites you turn on, such as homely.com.au. By using
        it you agree to these terms. If you don’t agree, please don’t use the extension.
      </p>

      <h4>Not affiliated with the property sites</h4>
      <p>
        The extension isn’t made, endorsed or checked by REA Group, Domain, Homely or any real estate agency. Comments
        appear alongside their pages only in your browser.
      </p>

      <h4>Comments are opinions, not facts we’ve checked</h4>
      <p>
        Comments are written by users and are their own views. We don’t verify them and don’t endorse them. Don’t rely
        on a comment alone when deciding whether to rent or buy: inspect the property, and get professional advice where
        it matters.
      </p>

      <h4>Rules for posting</h4>
      <ul>
        {POSTING_RULES.map(rule => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <h4>Your comments</h4>
      <p>
        You keep ownership of what you write. By posting, you give us permission to store, display and distribute it to
        users of the extension, and you confirm it follows these rules. You’re legally responsible for your comments.
        You can edit a comment for 15 minutes after posting it, and delete your own comments from the browser you posted
        them in, where the extension offers it.
      </p>

      <h4>Moderation and complaints</h4>
      <p>
        We don’t review comments before they appear, but we may remove any comment, or block anyone from posting, at our
        discretion and without notice. If you believe a comment is defamatory, breaches your privacy or breaks these
        rules, use the Report button on the comment or email <ComplaintsLink />. Tell us which comment (and its
        property), and why. We aim to review complaints within 7 days.
      </p>

      <h4>No warranty</h4>
      <p>
        The extension is provided as is, without warranties of any kind, and may change, break or stop at any time. To
        the extent the law allows, we aren’t liable for any loss arising from your use of the extension or from anything
        users post. Nothing in these terms excludes rights you have under the Australian Consumer Law that can’t be
        excluded.
      </p>

      <h4>Changes</h4>
      <p>
        We may update these terms. The current version is always available from the extension’s panel, and continuing to
        use the extension means you accept it.
      </p>
    </Dialog>
  )
}

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog id='rec-privacy-title' title='Privacy policy' class='legal' onClose={onClose}>
      <p class='dialog-intro'>Last updated {UPDATED}</p>
      <p>
        This explains what Real Estate Comments collects and what it does with it. In short: no accounts, no tracking,
        no ads, and nothing is sold.
      </p>

      <h4>When you view a property</h4>
      <p>
        The extension only runs on realestate.com.au and domain.com.au, and on other property sites if you turn them on
        (currently homely.com.au). Turning a site on is a setting in your browser; we aren’t told. To show comments, it
        reads the address of the property you’re viewing from the page and sends it to our database to look up comments.
        Searches you make in the panel are sent the same way, and so is the suburb of a search results page you’re
        viewing, to count its comments. We don’t keep a record of the properties or suburbs you view or search for.
      </p>

      <h4>When you post or vote</h4>
      <p>A comment is stored with:</p>
      <ul>
        <li>its text, and the name you give (or “Anonymous”)</li>
        <li>the property’s address, suburb, state and postcode, and the page you posted it from</li>
        <li>the date and time, and when it was last edited</li>
        <li>for a reply, which comment it answers</li>
        <li>
          two random identifiers, one made by the extension and one by its anonymous Firebase sign-in, which link the
          comment to your browser so you can delete it and so we can block abuse. They don’t contain your name, email or
          IP address.
        </li>
      </ul>
      <p>
        Comments, names, votes and these identifiers are publicly readable. Don’t put anything in a comment or name that
        you don’t want public. Votes are stored against the same random identifier.
      </p>

      <h4>Spam protection</h4>
      <p>
        When you start writing a comment, the extension loads a check from Cloudflare Turnstile to confirm you’re not a
        bot. For this, Cloudflare sees your IP address and some details of your browser and device, under Cloudflare’s
        privacy policy. It isn’t told which page you’re on. Just reading comments never contacts Cloudflare.
      </p>
      <p>
        New comments, edits, reports and votes are sent through our server (which runs on Cloudflare Workers). It checks
        the result and limits how often comments can be posted, edited, reported or voted on from one internet
        connection. For that it keeps, for about a day, a code made from your IP address that can’t be turned back into
        the address, with the times of those actions and which comments were reported. Your IP address itself isn’t
        stored or added to your comment. To stop the same text being posted over and over, it also keeps a similar code
        made from each comment’s text for a week. To allow one upvote per comment from each internet connection, it
        keeps, while your upvote stands, a code made from the comment and your IP address, with your random identifiers.
        So that a moderator can block someone from posting, it keeps the code made from your IP address with each
        comment you post, and your random identifiers, for 90 days. If you’re blocked, that code is kept for as long as
        the block lasts (60 days).
      </p>

      <h4>Images in comments</h4>
      <p>
        When a comment links to an image on a supported image host (such as Imgur), the extension shows it as a
        thumbnail, so your browser loads the image straight from that host when you view the comment. Like any website,
        the host can see your IP address and browser when it sends the image. The extension doesn’t tell it which page
        you’re on. We don’t host images.
      </p>

      <h4>Stored in your browser</h4>
      <p>
        Your random identifier, your display name, your settings (theme, panel width, sort order), whether you’ve agreed
        to the posting rules, whether you’ve seen what’s new in an update, when you installed it and whether we’ve asked
        you for a review, and your notifications are kept in your browser’s extension storage, and never leave it except
        as described above. Comments are cached in your browser for a few minutes.
      </p>
      <p>
        The properties on your watchlist are kept in your browser’s synced extension storage, so if your browser syncs
        your data (for example, when you’re signed in to Chrome or Firefox), your browser’s provider stores and syncs
        them across your devices. We never receive your watchlist; checking it for new comments looks up each property
        the same way as viewing it.
      </p>
      <p>
        For notifications, while the panel is open the extension looks up the comments posted with your random
        identifier, and replies to them. Nothing is checked while the panel is closed, and we don’t keep a record of
        these lookups.
      </p>

      <h4>Who holds the data</h4>
      <p>
        Comments are stored in Google Firebase (Firestore and anonymous Firebase Authentication), on Google’s servers,
        which may be outside Australia. New comments pass through Cloudflare (Workers and Turnstile) on the way. Both
        may log technical details such as IP addresses as part of providing their services; see Google’s and
        Cloudflare’s privacy policies. We don’t use analytics, advertising or tracking services.
      </p>

      <h4>Reports and support</h4>
      <p>
        When you report a comment, we store the comment’s identifier, the reason you chose, any details you write, the
        date and time, and your random Firebase identifier (so each person can report a comment only once). Reports can
        only be read by us, and we keep them as a record of how complaints were handled.
      </p>
      <p>
        “Report a bug” opens a GitHub issue that you can review before submitting. GitHub issues are public and linked
        to your GitHub account. To raise something privately, email <ComplaintsLink />.
      </p>

      <h4>How long we keep it</h4>
      <p>
        Comments are kept until you or we delete them. Uninstalling the extension removes the data stored in your
        browser, but not comments you’ve posted.
      </p>

      <h4>Your choices</h4>
      <p>
        To have a comment removed, or to ask about information we hold, email <ComplaintsLink />. Because there are no
        accounts, we may need you to point out the comment.
      </p>
      <p>
        You can only delete your own comments from the browser you posted them in, so if you uninstall the extension or
        change browsers, you’ll need to email us instead. Comments aren’t linked to an account, so we have no way to
        confirm who wrote one. We treat these requests like any other request to remove a comment and decide based on
        the comment itself, so we can’t promise to remove one just because someone says they wrote it.
      </p>
    </Dialog>
  )
}
