import type { ComponentChildren } from 'preact'

// Icon paths from Lucide (https://lucide.dev, ISC licence)
function Icon({ children, size = 18 }: { children: ComponentChildren; size?: number }) {
  return (
    <svg
      class='icon'
      width={size}
      height={size}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      stroke-width='2'
      stroke-linecap='round'
      stroke-linejoin='round'
      aria-hidden='true'
    >
      {children}
    </svg>
  )
}

export const MessageIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d='M7.9 20A9 9 0 1 0 4 16.1L2 22Z' />
  </Icon>
)

export const CloseIcon = () => (
  <Icon>
    <path d='M18 6 6 18' />
    <path d='m6 6 12 12' />
  </Icon>
)

export const UpvoteIcon = () => (
  <Icon size={16}>
    <path d='M9 18v-6H5l7-7 7 7h-4v6H9z' />
  </Icon>
)

export const TrashIcon = () => (
  <Icon size={16}>
    <path d='M3 6h18' />
    <path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' />
    <path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' />
  </Icon>
)

export const ReplyIcon = () => (
  <Icon size={14}>
    <path d='M20 18v-2a4 4 0 0 0-4-4H4' />
    <path d='m9 17-5-5 5-5' />
  </Icon>
)

export const PencilIcon = () => (
  <Icon size={14}>
    <path d='M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' />
    <path d='m15 5 4 4' />
  </Icon>
)

export const FlagIcon = () => (
  <Icon size={16}>
    <path d='M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' />
    <path d='M4 22v-7' />
  </Icon>
)

export const ExternalIcon = () => (
  <Icon size={14}>
    <path d='M15 3h6v6' />
    <path d='M10 14 21 3' />
    <path d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' />
  </Icon>
)

export const RefreshIcon = () => (
  <Icon size={16}>
    <path d='M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' />
    <path d='M21 3v5h-5' />
    <path d='M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' />
    <path d='M8 16H3v5' />
  </Icon>
)

export const InfoIcon = () => (
  <Icon size={16}>
    <circle cx='12' cy='12' r='10' />
    <path d='M12 16v-4' />
    <path d='M12 8h.01' />
  </Icon>
)

export const HeartIcon = () => (
  <Icon size={14}>
    <path d='M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' />
  </Icon>
)

export const HomeIcon = () => (
  <Icon size={16}>
    <path d='M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' />
    <path d='M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
  </Icon>
)

export const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <circle cx='11' cy='11' r='8' />
    <path d='m21 21-4.3-4.3' />
  </Icon>
)

export const ChevronRightIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d='m9 18 6-6-6-6' />
  </Icon>
)

export const ChevronLeftIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d='m15 18-6-6 6-6' />
  </Icon>
)

export const SunIcon = () => (
  <Icon>
    <circle cx='12' cy='12' r='4' />
    <path d='M12 2v2' />
    <path d='M12 20v2' />
    <path d='m4.93 4.93 1.41 1.41' />
    <path d='m17.66 17.66 1.41 1.41' />
    <path d='M2 12h2' />
    <path d='M20 12h2' />
    <path d='m6.34 17.66-1.41 1.41' />
    <path d='m19.07 4.93-1.41 1.41' />
  </Icon>
)

export const MoonIcon = () => (
  <Icon>
    <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
  </Icon>
)

// The extension's filled chat bubble, used on the launcher since 1.x (Font Awesome "comment", CC BY 4.0)
export const BrandIcon = ({ size = 24 }: { size?: number }) => (
  <svg class='icon' width={size} height={size} viewBox='0 0 512 512' fill='currentColor' aria-hidden='true'>
    <path d='M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z' />
  </svg>
)
