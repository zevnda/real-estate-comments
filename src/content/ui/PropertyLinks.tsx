import type { PropertyLinks as Links } from '../../shared/property'

import { getSite } from '../../shared/property'
import { ExternalIcon } from './icons'

// Links to a property's profile pages on both sites, plus a web search for the rare address neither site has a page
// for. The site the user is on comes first.
export function PropertyLinks({ links }: { links: Links }) {
  const sites = [
    { site: 'realestate', label: 'realestate.com.au', href: links.realestate },
    { site: 'domain', label: 'Domain', href: links.domain },
  ]
  if (getSite(location.hostname) === 'domain') sites.reverse()
  return (
    <span class='property-links'>
      {[...sites, { site: 'search', label: 'Search', href: links.search }].map(({ site, label, href }) => (
        <a key={site} href={href} target='_blank' rel='noopener noreferrer' title={`View this property on ${label}`}>
          {label}
          <ExternalIcon />
        </a>
      ))}
    </span>
  )
}
