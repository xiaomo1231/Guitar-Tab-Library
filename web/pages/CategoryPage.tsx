import { hrefGroup } from '../lib/route'
import { useLibrary } from '../lib/libraryContext'
import { useRestoreScroll } from '../lib/scrollMemory'
import { Link } from '../components/Link'
import { Notice, PageBar } from '../components/ui'
import { cx, LIST } from '../lib/classes'

/** A category with several groups (分组): the groups as contents rows; tap one for its artists. */
export function CategoryPage({ id }: { id: string }) {
  const { info } = useLibrary()
  const category = info?.categories.find((c) => c.id === id)
  useRestoreScroll(category !== undefined)

  if (!category) {
    return (
      <>
        <PageBar title="分类" back="‹ 谱库" fallback="#/" />
        <div className="py-6">
          <Notice>找不到这个分类。文件夹可能已经改过名字，回到目录重新看一下。</Notice>
        </div>
      </>
    )
  }

  return (
    <>
      <PageBar
        title={category.name}
        back="‹ 谱库"
        fallback="#/"
        subtitle={`${category.groups.length} 个分组 · ${category.files.toLocaleString('zh-CN')} 份`}
      />
      {category.groups.length === 0 ? (
        <div className="py-6">
          <Notice>这个分类里还没有内容。</Notice>
        </div>
      ) : (
        <ol className={cx(LIST, 'mb-20 list-none p-0')}>
          {category.groups.map((g) => (
            <li key={g.id} className="border-t border-border first:border-t-0">
              <Link
                href={hrefGroup(g)}
                className="flex min-h-[60px] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-[hsl(var(--raised))]"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[17px] font-bold">{g.name}</b>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {g.artists.toLocaleString('zh-CN')} {g.noun}
                  </span>
                </span>
                <span className="mono shrink-0 text-[13px] text-muted-foreground">
                  {g.files.toLocaleString('zh-CN')}
                </span>
                <span aria-hidden className="shrink-0 text-muted-foreground">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
