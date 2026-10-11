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

const UPDATED = '12 October 2026'

const ComplaintsLink = () => <a href={complaintsMailto()}>{COMPLAINTS_EMAIL}</a>

export function TermsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog id='rec-terms-of-use-title' title='Terms of use' class='legal' onClose={onClose}>
      <p class='dialog-intro'>Last updated {UPDATED}</p>
      <p>
        Real Estate Comments is a free, independent browser extension that lets people share comments about properties
        listed on realestate.com.au and domain.com.au. By using it you agree to these terms. If you don’t agree, please
        don’t use the extension.
      </p>

      <h4>Not affiliated with the property sites</h4>
      <p>
        The extension isn’t made, endorsed or checked by REA Group, Domain or any real estate agency. Comments appear
        alongside their pages only in your browser.
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
        Comments can’t be edited; you can delete your own comments from the browser you posted them in, where the
        extension offers it.
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
        The extension only runs on realestate.com.au and domain.com.au. To show comments, it reads the address of the
        property you’re viewing from the page and sends it to our database to look up comments. Searches you make in the
        panel are sent the same way. We don’t keep a record of the properties you view or search for.
      </p>

      <h4>When you post or vote</h4>
      <p>A comment is stored with:</p>
      <ul>
        <li>its text, and the name you give (or “Anonymous”)</li>
        <li>the property’s address, suburb, state and postcode, and the page you posted it from</li>
        <li>the date and time</li>
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

      <h4>Images in comments</h4>
      <p>
        When a comment links to an image on a supported image host (such as Imgur), the extension shows it as a
        thumbnail, so your browser loads the image straight from that host when you view the comment. Like any website,
        the host can see your IP address and browser when it sends the image. The extension doesn’t tell it which page
        you’re on. We don’t host images.
      </p>

      <h4>Stored in your browser</h4>
      <p>
        Your random identifier, your display name, your settings (theme, panel width, sort order) and which properties
        you posted on in the last day, and when (to limit posting rate), are kept in your browser’s extension storage,
        and never leave it except as described above. Comments are cached in your browser for a few minutes.
      </p>

      <h4>Who holds the data</h4>
      <p>
        Comments are stored in Google Firebase (Firestore and anonymous Firebase Authentication), on Google’s servers,
        which may be outside Australia. Google may log technical details such as IP addresses as part of providing that
        service; see Google’s privacy policy. We don’t use analytics, advertising or tracking services.
      </p>

      <h4>Reports and support</h4>
      <p>
        When you report a comment, we store the comment’s identifier, the reason you chose, any details you write, the
        date and time, and your random Firebase identifier (so each person can report a comment only once). Reports can
        only be read by us, and we keep them as a record of how complaints were handled.
      </p>
      <p>
        “Report a problem” opens a GitHub issue that you can review before submitting. GitHub issues are public and
        linked to your GitHub account. To raise something privately, email <ComplaintsLink />.
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
    </Dialog>
  )
}
