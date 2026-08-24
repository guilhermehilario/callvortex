import type { CSSProperties, SVGProps } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className?: string): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': true
  }
}

const slashStyle: CSSProperties = { stroke: 'var(--red)' }

export function MicIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

export function MicOffIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <line x1="1" y1="1" x2="23" y2="23" style={slashStyle} />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

export function HeadphonesIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

export function HeadphonesOffIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <line x1="1" y1="1" x2="23" y2="23" style={slashStyle} />
      <path d="M3 18v-6a9 9 0 0 1 14.23-7.2" />
      <path d="M21 12v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

export function PhoneOffIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  )
}

export function VideoIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

export function ScreenShareIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="12" y1="13" x2="12" y2="7" />
      <polyline points="8 10 12 6 16 10" />
    </svg>
  )
}

export function ActivitiesIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" />
    </svg>
  )
}

export function RouterIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

export function GearIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export function BroadcastIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function RefreshIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

export function VolumeHighIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )
}

export function VolumeMuteIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}

export function PencilIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

export function PowerIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
      <line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  )
}

export function MonitorIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

export function MonitorOffIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M17 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h1m5.66 0H20a2 2 0 0 1 2 2v10a2 2 0 0 1-.6 1.42" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="1" y1="1" x2="23" y2="23" style={slashStyle} />
    </svg>
  )
}

export function ExpandIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

export function ShrinkIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <path d="M4 14h6v6" />
      <path d="M20 10h-6V4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

export function PipIcon({ size = 20, className }: IconProps): React.JSX.Element {
  return (
    <svg {...base(size, className)}>
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <rect x="11" y="11" width="9" height="7" rx="1" ry="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
