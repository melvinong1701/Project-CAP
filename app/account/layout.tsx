import type { ReactNode } from 'react'

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowY: 'auto', height: '100dvh' }}>
      {children}
    </div>
  )
}
