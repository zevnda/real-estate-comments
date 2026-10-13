import type { AreaStats } from '../../shared/messages'
import type { Area } from '../../shared/property'
import type { Loadable } from '../hooks'

import { areaLabel, titleCase } from '../../shared/property'
import { pluralize } from '../format'
import { MapPinIcon } from './icons'

// On a suburb's search results page: how much has been said about the suburb, and a way to see it
export function AreaCard({ area, stats, onShow }: { area: Area; stats: Loadable<AreaStats>; onShow: () => void }) {
  const data = stats.status === 'ready' ? stats.data : null
  return (
    <section class='area-card' aria-label={`Comments in ${areaLabel(area)}`}>
      <div class='area-card-icon'>
        <MapPinIcon />
      </div>
      <div class='area-card-body'>
        <p class='area-card-title'>{areaLabel(area)}</p>
        <p class='area-card-stats'>
          {data
            ? data.comments
              ? `${data.capped ? `${data.comments}+ comments` : pluralize(data.comments, 'comment')} on ${pluralize(data.properties, 'property', 'properties')}`
              : `No comments in ${titleCase(area.suburb)} yet. Open a listing to be the first.`
            : stats.status === 'error'
              ? 'Couldn’t load this suburb’s comments.'
              : 'Counting comments…'}
        </p>
      </div>
      {data && data.comments > 0 && (
        <button type='button' class='button button--ghost' onClick={onShow}>
          See them
        </button>
      )}
    </section>
  )
}
