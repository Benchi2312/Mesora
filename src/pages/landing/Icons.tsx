import type { ReactNode } from 'react'

type IconProps = {
  className?: string
  children?: ReactNode
}

function Base({ className, children }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconClipboard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2.5h6V5H9z" />
      <path d="M9 11h6M9 15h4" />
    </Base>
  )
}

export function IconPot(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 9h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" />
      <path d="M8 3.5V7M12 3.5V7M16 3.5V7" />
    </Base>
  )
}

export function IconCard(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18M7 14.5h4" />
    </Base>
  )
}

export function IconChartBar(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20h16" />
      <rect x="5.5" y="11" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="5.5" width="3.5" height="12.5" rx="1" />
      <rect x="15.5" y="8" width="3.5" height="10" rx="1" />
    </Base>
  )
}

export function IconGrid(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Base>
  )
}

export function IconRocket(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2.5c3.2 2.6 4.8 5.8 4.8 9.2 0 .9-.5 1.7-1.3 2L12 15l-3.5-1.3a2.3 2.3 0 0 1-1.3-2c0-3.4 1.6-6.6 4.8-9.2Z" />
      <path d="M12 15v4.5M9 19.5c2 1 4 1 6 0" />
    </Base>
  )
}

export function IconPlay(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 5.5l10 6.5-10 6.5z" />
    </Base>
  )
}

export function IconArrowRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 12h16M13.5 6l6 6-6 6" />
    </Base>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 12.5l5 5L19.5 6.5" />
    </Base>
  )
}

export function IconTrendingUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </Base>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16.5 4.7a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18.5 14.4c2.2.8 3.5 3 3.5 5.6" />
    </Base>
  )
}

export function IconWallet(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 7h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12" />
      <path d="M17 13.6h.01" />
    </Base>
  )
}

export function IconInstagram(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function IconFacebook(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.4-1.4 1.5-1.4h1.4V5.5C16 5.5 15 5.3 13.9 5.3c-2.1 0-3.4 1.3-3.4 3.6v2.3H8V14h2.5v7h3Z" />
    </Base>
  )
}

export function IconXSocial(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 4l16 16M20 4L4 20" />
    </Base>
  )
}

export function IconLinkedIn(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 10v6.5M8 7.4v.01M12 16.5v-3.6a2 2 0 0 1 4 0v3.6" />
    </Base>
  )
}