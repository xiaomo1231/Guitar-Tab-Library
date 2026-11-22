import { useState } from 'react'
import { useRestoreScroll } from '../lib/scrollMemory'
import type { ScoreCategory } from '@/songs/scoreLibraryTypes'
import { dailyStaffNotes } from '@/songs/dailyStaff'
import { useFavorites } from '../lib/favorites'
import { usePractice } from '../lib/practice'
import { libraryName } from '../lib/format'
import {
  hrefCategory,
  hrefGroup,
  hrefSearch,
  hrefViewer,
  HREF_DAILY,
  HREF_FAVORITES,
  HREF_MINE,
} from '../lib/route'
import { MINE_KIND_LABEL, mineRows, useMine } from '../lib/mine'
import { useLibrary } from '../lib/libraryContext'
import { readRecent, type RecentItem } from '../lib/recent'
import { buildContinueList } from '../lib/continueList'
import { doneCount, todayNumber, useDaily } from '../lib/daily'
import { Link } from '../components/Link'
import { cx, LIST, SECTION_TITLE } from '../lib/classes'
import { Notice } from '../components/ui'
import { DailyStaff } from '../viewer/DailyStaff'

/** A category with one group opens that group directly; more than one shows the groups first. */
function categoryHref(c: ScoreCategory): string {
  const only = c.groups.length === 1 ? c.groups[0] : undefined
  return only ? hrefGroup(only) : hrefCategory(c.id)
}

/** Unsorted or unidentified folders go to the appendix below the contents. */
function isAppendix(c: ScoreCategory): boolean {
  return /未识别|待整理/.test(c.name)
}

/** 目录: the library's name as a heavy title, the categories as contents rows, 继续练 and 每日一练 beside them. */
export function Home() {
  const { info, scanning } = useLibrary()
  const categories = info?.categories ?? []
  useRestoreScroll(info !== null && info !== undefined)
  const main = categories.filter((c) => !isAppendix(c))
  const appendix = categories.filter(isAppendix)

  return (
    <>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-4 pt-5 min-[861px]:pt-7">
        <h1 className="m-0 font-display text-[26px] font-black leading-tight min-[861px]:text-[30px]">
          谱库
        </h1>
        {info && (
          <p className="mono m-0 min-w-0 truncate text-xs text-muted-foreground">
            {libraryName(info.root)} · {info.files.toLocaleString('zh-CN')} 份谱
          </p>
        )}
      </header>
      <Link
        href={hrefSearch()}
        ariaLabel="搜索谱"
        className="flex min-h-[54px] items-center gap-2.5 rounded-[14px] border border-border bg-card px-3.5 text-base text-muted-foreground transition-colors hover:border-foreground"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 21 21" />
        </svg>
        <span>搜歌名、歌手，或者拼音首字母</span>
      </Link>
      {scanning && (
        <p className="mt-3 text-xs text-muted-foreground">
          正在扫描文件夹，已经扫到的谱子可以先看。
        </p>
      )}

      <div className="grid gap-8 pb-20 pt-7 min-[861px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] min-[861px]:gap-10">
        <div className="min-w-0 space-y-8">
          <ContinueSection />
          <section aria-label="分类" className="min-w-0">
            <h2 className={cx(SECTION_TITLE, 'mb-2.5')}>分类</h2>
            {categories.length === 0 ? (
              <Notice>
                谱库里还没有找到谱子。请确认电脑上的谱库文件夹，然后在「我的」里点「重新扫描谱库」。
              </Notice>
            ) : (
              <>
                <ul className={cx(LIST, 'm-0 list-none p-0')}>
                  {main.map((c) => (
                    <CategoryRow key={c.id} c={c} />
                  ))}
                </ul>
                {appendix.length > 0 && (
                  <>
                    <h2 className={cx(SECTION_TITLE, 'mb-2.5 mt-8')}>待整理</h2>
                    <ul className={cx(LIST, 'm-0 list-none p-0')}>
                      {appendix.map((c) => (
                        <CategoryRow key={c.id} c={c} appendix />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          <MineSection />
          <DailySection />
        </aside>
      </div>
    </>
  )
}

const CHEVRON = (
  <span aria-hidden className="shrink-0 text-muted-foreground">
    ›
  </span>
)

/** One category: its name and file count; sub-groups under it when there are several. */
function CategoryRow({ c, appendix = false }: { c: ScoreCategory; appendix?: boolean }) {
  const grouped = c.groups.length > 1
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={categoryHref(c)}
        className="flex min-h-[60px] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-[hsl(var(--raised))]"
      >
        <span
          className={cx(
            'min-w-0 flex-1 truncate text-[17px] font-bold',
            appendix && 'text-muted-foreground',
          )}
        >
          {c.name}
        </span>
        <span className="mono shrink-0 text-[13px] text-muted-foreground">
          {c.files.toLocaleString('zh-CN')}
        </span>
        {CHEVRON}
      </Link>
      {grouped && (
        <div className="flex flex-wrap gap-2 px-3.5 pb-3">
          {c.groups.map((g) => (
            <Link
              key={g.id}
              href={hrefGroup(g)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {g.name}
              <span className="mono text-[11px]">{g.files.toLocaleString('zh-CN')}</span>
            </Link>
          ))}
        </div>
      )}
    </li>
  )
}

/** 继续练: one row per song practised or opened on this device, latest first, with a link to the favourites. */
function ContinueSection() {
  const practice = usePractice()
  const { items: favorites } = useFavorites()
  const [recent] = useState<RecentItem[]>(() => readRecent())
  const [now] = useState(() => Date.now())
  const rows = buildContinueList({ practice: practice.items, recent, favorites, now })

  return (
    <section className="scroll-mt-16">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className={SECTION_TITLE}>继续练</h2>
        <Link
          href={HREF_FAVORITES}
          className="text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          我的收藏 ›
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className={cx(LIST, 'm-0 px-3.5 py-4 text-sm text-muted-foreground')}>
          打开或练习过的谱会出现在这里。
        </p>
      ) : (
        <ul className={cx(LIST, 'm-0 list-none p-0')}>
          {rows.map((r) => (
            <li key={r.key} className="border-t border-border first:border-t-0">
              <Link
                href={hrefViewer({
                  path: r.path,
                  format: r.format,
                  pages: r.pages,
                  title: r.title,
                  artist: r.artist,
                })}
                className="flex min-h-[60px] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-[hsl(var(--raised))]"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-bold">{r.title}</b>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {r.artist ? `${r.artist} · ${r.line}` : r.line}
                  </span>
                </span>
                <span className="mono shrink-0 text-[11px] text-muted-foreground">{r.when}</span>
                {CHEVRON}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 我的谱子: the latest 改编谱, uploaded songs and 组合乐队谱; the whole list on its own page. */
function MineSection() {
  const { data } = useMine()
  const rows = data ? mineRows(data) : []
  return (
    <section className="scroll-mt-16">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className={SECTION_TITLE}>我的谱子</h2>
        <Link
          href={HREF_MINE}
          className="text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          {rows.length > 5 ? `全部 ${rows.length} 个 ›` : '全部 ›'}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className={cx(LIST, 'm-0 px-3.5 py-4 text-sm leading-relaxed text-muted-foreground')}>
          {data ? '在看谱页「音轨」里换乐器后可以保存成改编谱，会出现在这里。' : '正在读取…'}
        </p>
      ) : (
        <ul className={cx(LIST, 'm-0 list-none p-0')}>
          {rows.slice(0, 5).map((r) => (
            <li key={r.key} className="border-t border-border first:border-t-0">
              <Link
                href={r.href}
                className="flex min-h-[60px] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-[hsl(var(--raised))]"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-bold">{r.name}</b>
                  <span className="block truncate text-[13px] text-muted-foreground">{r.line}</span>
                </span>
                <span className="shrink-0 rounded-full border border-border px-2 text-[11px] leading-5 text-muted-foreground">
                  {MINE_KIND_LABEL[r.kind]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 每日一练: this quarter's days as a small staff, and today's step. Hidden when the library has none or the read fails. */
function DailySection() {
  const daily = useDaily()
  const [now] = useState(() => Date.now())
  const s = daily.state
  if (!s || !s.available || daily.error) return null

  const started = s.startedAt !== null
  const today = todayNumber(s.startedAt, now)
  const staff = dailyStaffNotes({
    today,
    done: s.done,
    bpm: s.bpm,
    days: s.days.map((d) => ({ day: d.day, tempos: d.tempos })),
  })
  const todayDay = s.days.find((d) => d.day === today)
  const doneToday = typeof s.done[String(today)] === 'number'

  return (
    <section className="scroll-mt-16">
      <h2 className={cx(SECTION_TITLE, 'mb-2.5')}>每日一练</h2>
      <div className={cx(LIST, 'px-3.5 py-3')}>
        {started ? (
          <>
            <DailyStaff
              data={staff}
              techniqueOf={(day) => s.days.find((d) => d.day === day)?.technique}
            />
            <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
              <p className="min-w-0 truncate">
                <span className="mono">第 {today} 天</span>
                {todayDay && (
                  <>
                    {' · '}
                    <strong className="font-bold">{todayDay.technique}</strong>
                  </>
                )}
                <span className="ml-2.5">
                  {doneToday ? (
                    <span className="text-primary">今天已练完</span>
                  ) : (
                    <span className="text-muted-foreground">今天还没练</span>
                  )}
                </span>
              </p>
              <Link
                href={HREF_DAILY}
                className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 transition-colors hover:border-foreground"
              >
                {doneToday ? '看看 →' : '去练 →'}
              </Link>
            </div>
            <p className="mono mt-1 text-[11px] text-muted-foreground">
              已练 {doneCount(s.done)} 天 · 越高 = 那天练到的速度越快
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="py-2.5 text-sm text-muted-foreground">
              每天十几分钟的技巧练习，从第 1 天开始。
            </p>
            <Link
              href={HREF_DAILY}
              className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:border-foreground"
            >
              开始 →
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
