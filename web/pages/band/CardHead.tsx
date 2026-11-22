import type { ReactNode } from 'react'

/** A card's heading row: a quiet title on the left, tools on the right. */
export function CardHead({ id, title, children }: { id?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 id={id} className="m-0 text-[13px] font-bold tracking-[0.02em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </div>
  )
}
