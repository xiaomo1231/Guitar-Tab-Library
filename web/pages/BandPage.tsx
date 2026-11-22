import { useEffect, useState, type ReactNode } from 'react'
import {
  api,
  errorText,
  type BandBrief,
  type BandSong,
  type DailyMemberProgress,
  type UserInfo,
} from '../lib/api'
import { rename, reorder, updateSong, useBand } from '../lib/band'
import { buttonClass, CARD, cx, LIST, LIST_ROW, SECTION_TITLE, SELECT } from '../lib/classes'
import { canBrowseLibrary, chooseBand, useMe } from '../lib/session'
import { navigate } from '../lib/route'
import { Notice, Tabs } from '../components/ui'
import { Link } from '../components/Link'
import { InvitesPanel } from '../components/InvitesPanel'
import { RehearsalHero } from './band/RehearsalHero'
import { AddSongs, OwnScores, SongCard } from './band/Setlist'
import { MembersSection } from './band/Members'
import { ActivitySection, SessionsSection } from './band/Side'
import { chipClass, FILTERS, NEXT_STATUS, SMALL_BUTTON, swapped, type Filter } from './band/shared'

type Tab = 'songs' | 'members' | 'settings'

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ['songs', '歌单'],
  ['members', '成员'],
  ['settings', '设置'],
]

const INPUT =
  'h-11 min-w-0 rounded-lg border border-border bg-transparent px-3 text-base text-foreground outline-none focus:border-primary'

/** The page's title row: the band's name, a quiet count, and tools on the right. */
function TitleRow({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-4 pt-5 min-[861px]:pt-7">
      <div className="min-w-0 flex-1">
        <h1 className="m-0 break-words font-display text-[26px] font-black leading-tight min-[861px]:text-[30px]">
          {title}
        </h1>
        {subtitle && <p className="mono m-0 mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

/** Not in any band yet: type an invite code (or open the link the leader sent). */
function NoBand() {
  const [code, setCode] = useState('')
  const clean = code.replace(/\s+/g, '').toUpperCase()
  return (
    <div className="max-w-[640px]">
      <TitleRow title="乐队" />
      <div className={cx(CARD, 'space-y-4')}>
        <div>
          <h2 className="m-0 text-[17px] font-bold">还没有加入乐队</h2>
          <p className="m-0 mt-1 text-sm leading-relaxed text-muted-foreground">
            你还没有加入任何乐队。向队长要一个邀请码填在下面；如果对方发的是链接，直接打开就行，不用另外注册。
          </p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (/^[A-Z0-9_-]{10,64}$/i.test(clean)) navigate(`#/invite/${clean}`)
          }}
        >
          <label className="sr-only" htmlFor="join-code">
            邀请码
          </label>
          <input
            id="join-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="邀请码，例如 K7QM3-PXD2A"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={cx(INPUT, 'mono flex-1 basis-56 bg-background tracking-[0.1em]')}
          />
          <button
            type="submit"
            disabled={!/^[A-Z0-9_-]{10,64}$/i.test(clean)}
            className={cx(buttonClass('primary'), 'px-5')}
          >
            加入
          </button>
        </form>
      </div>
    </div>
  )
}

/** Several bands: which one the pages work in (remembered on this device). */
function BandSwitcher({ bands, current }: { bands: BandBrief[]; current: string }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label="切换乐队">
      <label className="sr-only" htmlFor="band-switch">
        我的乐队
      </label>
      <select
        id="band-switch"
        value={current}
        onChange={(e) => chooseBand(e.target.value)}
        className={cx(SELECT, 'max-w-[14rem] bg-card font-medium')}
      >
        {bands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.leader ? '（队长）' : ''}
          </option>
        ))}
      </select>
      <Link
        href="#/invite"
        className="inline-flex min-h-11 items-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        加入其他乐队
      </Link>
    </div>
  )
}

/** 乐队 page: the rehearsal on top, then 歌单 / 成员 / 设置, with 最近动态 and 排练记录 beside. */
export function BandPage() {
  const { state, error, reload } = useBand()
  const me = useMe()
  const browse = me !== null && canBrowseLibrary(me)
  const [tab, setTab] = useState<Tab>('songs')
  const [filter, setFilter] = useState<Filter>('all')
  const [sorting, setSorting] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  // Each member's 每日一练 progress; a failed read just leaves the lines out.
  const [daily, setDaily] = useState<Map<string, DailyMemberProgress> | null>(null)

  const bandId = state?.id ?? null
  useEffect(() => {
    if (!bandId) return
    let alive = true
    api.dailyMembers().then(
      (list) => {
        if (alive) setDaily(new Map(list.map((p) => [p.userId, p])))
      },
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [bandId])

  const run = async (key: string, job: () => Promise<void>) => {
    if (busy) return
    setBusy(key)
    setNotice(null)
    try {
      await job()
    } catch (e) {
      setNotice(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  if (me && me.bands.length === 0) return <NoBand />

  if (!state) {
    return (
      <div className="max-w-[640px]">
        <TitleRow title="乐队" />
        {error ? (
          <div className="space-y-3">
            <Notice tone="error">{error}</Notice>
            <button type="button" onClick={reload} className={buttonClass('outline')}>
              重试
            </button>
          </div>
        ) : (
          <div className={CARD}>
            <p className="m-0 text-sm text-muted-foreground">正在读取…</p>
          </div>
        )}
      </div>
    )
  }

  const manager = me !== null && (me.role === 'admin' || me.id === state.leaderId)
  const memberById = new Map<string, UserInfo>(state.members.map((m) => [m.id, m]))
  const nameOf = (id: string) => memberById.get(id)?.displayName ?? '已离开的成员'
  const shown = filter === 'all' ? state.songs : state.songs.filter((s) => s.status === filter)
  const countOf = (f: Filter) =>
    f === 'all' ? state.songs.length : state.songs.filter((s) => s.status === f).length

  const move = (index: number, dir: -1 | 1) => {
    const ids = state.songs.map((s) => s.id)
    void run('move', () => reorder(swapped(ids, index, index + dir)))
  }

  const cycleStatus = (song: BandSong) =>
    void run(song.id, () => updateSong({ id: song.id, status: NEXT_STATUS[song.status] }))

  const startRename = () => {
    setNameDraft(state.name)
    setRenaming(true)
  }

  const saveName = () => {
    const name = nameDraft.trim()
    if (!name) return
    void run('name', async () => {
      await rename(name)
      setRenaming(false)
    })
  }

  const focusAdd = () => {
    const input = document.getElementById('band-add-search')
    input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    input?.focus({ preventScroll: true })
  }

  const songsTab = (
    <>
      {state.songs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="状态筛选" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={chipClass(filter === f)}
              >
                {label}
                <span className="mono ml-1.5 text-[11px] opacity-70">{countOf(f)}</span>
              </button>
            ))}
          </div>
          <span className="flex gap-1.5">
            {state.songs.length > 1 && (
              <button
                type="button"
                aria-pressed={sorting}
                onClick={() => setSorting((v) => !v)}
                className={cx(SMALL_BUTTON, sorting && 'border-primary text-primary')}
              >
                {sorting ? '完成' : '排序'}
              </button>
            )}
            {browse && (
              <button type="button" onClick={focusAdd} className={SMALL_BUTTON}>
                ＋ 添加歌曲
              </button>
            )}
          </span>
        </div>
      )}

      {state.songs.length === 0 ? (
        <Notice>
          {browse
            ? '歌单还是空的。在下面「添加歌曲」里搜索谱子，选一个版本加入，乐队成员就能一起排练它。每首歌可以记录状态、分配声部、设定排练速度和备注。'
            : '歌单还是空的。等管理员或能看谱库的成员把歌加进来，这里就会出现。'}
        </Notice>
      ) : shown.length === 0 ? (
        <div className="pt-3">
          <Notice>这个状态下还没有歌。</Notice>
        </div>
      ) : (
        <ol aria-label="排练歌单" className="m-0 flex list-none flex-col gap-2.5 p-0 pt-3">
          {shown.map((song) => {
            const index = state.songs.indexOf(song)
            return (
              <SongCard
                key={song.id}
                index={index}
                total={state.songs.length}
                song={song}
                progress={state.progress[song.id] ?? []}
                meId={me?.id ?? null}
                nameOf={nameOf}
                busy={busy !== null}
                sorting={sorting}
                onStatus={() => cycleStatus(song)}
                onMove={(dir) => move(index, dir)}
              />
            )
          })}
        </ol>
      )}

      {/* Picking songs needs the library; members who only see the band cannot search it. */}
      {browse && (
        <AddSongs inSetlist={new Set(state.songs.map((s) => s.path))} busy={busy} run={run} />
      )}

      <OwnScores used={new Set(state.songs.flatMap((s) => (s.uploadId ? [s.uploadId] : [])))} />
    </>
  )

  const membersTab = (
    <>
      <MembersSection band={state} meId={me?.id ?? null} manager={manager} daily={daily} />
      {manager && (
        <div className="pt-8">
          <InvitesPanel
            key={state.id}
            title="邀请成员"
            bandId={state.id}
            nameOf={nameOf}
            canGrantLibrary={browse}
          />
        </div>
      )}
    </>
  )

  const settingsTab = (
    <div className="space-y-6">
      {manager && (
        <section aria-labelledby="band-name-title">
          <h2 id="band-name-title" className={cx(SECTION_TITLE, 'mb-2.5')}>
            乐队名称
          </h2>
          {renaming ? (
            <form
              className={cx(CARD, 'flex flex-wrap items-center gap-2')}
              onSubmit={(e) => {
                e.preventDefault()
                saveName()
              }}
            >
              <label className="sr-only" htmlFor="band-name">
                乐队名称
              </label>
              <input
                id="band-name"
                value={nameDraft}
                maxLength={40}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                className={cx(INPUT, 'flex-1 basis-48 bg-background')}
              />
              <button
                type="submit"
                disabled={!nameDraft.trim() || busy === 'name'}
                className={buttonClass('primary')}
              >
                保存
              </button>
              <button type="button" onClick={() => setRenaming(false)} className={buttonClass('ghost')}>
                取消
              </button>
            </form>
          ) : (
            <div className={cx(LIST)}>
              <button type="button" onClick={startRename} className={cx(LIST_ROW, 'w-full text-left')}>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-bold">{state.name || '乐队'}</b>
                  <span className="block text-[13px] text-muted-foreground">点一下改名</span>
                </span>
                <span className="shrink-0 text-sm text-primary">改名</span>
              </button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="band-other-title">
        <h2 id="band-other-title" className={cx(SECTION_TITLE, 'mb-2.5')}>
          其他乐队
        </h2>
        <div className={LIST}>
          <Link href="#/invite" className={LIST_ROW}>
            <span className="min-w-0 flex-1">
              <b className="block font-bold">加入其他乐队</b>
              <span className="block text-[13px] text-muted-foreground">填写另一个乐队的邀请码</span>
            </span>
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
        </div>
      </section>

      {!manager && (
        <p className="m-0 text-[13px] text-muted-foreground">乐队名称等设置只有队长可以修改。</p>
      )}
    </div>
  )

  const hasSide = (state.activity?.length ?? 0) > 0 || state.sessions.length > 0

  return (
    <div className="max-w-[1080px] pb-20">
      <TitleRow
        title={state.name || '乐队'}
        subtitle={`${state.songs.length} 首歌 · ${state.members.length} 位成员`}
      >
        {me && me.bands.length > 1 && <BandSwitcher bands={me.bands} current={state.id} />}
      </TitleRow>

      <div
        className={cx(
          'grid gap-5',
          hasSide && 'min-[1100px]:grid-cols-[minmax(0,1fr)_300px] min-[1100px]:items-start',
        )}
      >
        <div className="flex min-w-0 flex-col gap-[18px]">
          <RehearsalHero band={state} meId={me?.id ?? null} manager={manager} />

          <Tabs<Tab> label="乐队页面" value={tab} options={TABS} onChange={setTab} />

          {notice && <Notice tone="error">{notice}</Notice>}

          <div role="tabpanel" aria-label={TABS.find(([t]) => t === tab)?.[1]} className="min-w-0">
            {tab === 'songs' ? songsTab : tab === 'members' ? membersTab : settingsTab}
          </div>
        </div>

        {hasSide && (
          <aside aria-label="乐队动态" className="flex min-w-0 flex-col gap-3.5">
            <ActivitySection activity={state.activity} songs={state.songs} nameOf={nameOf} />
            <SessionsSection sessions={state.sessions} />
          </aside>
        )}
      </div>
    </div>
  )
}
