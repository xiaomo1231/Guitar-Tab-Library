import { useEffect, type ReactNode } from 'react'
import type { ScoreFormat } from '@/songs/scoreLibraryTypes'
import { fileUrl } from '../lib/api'
import { fileBaseName, formatOfPath, isScoreFormat } from '../lib/format'
import { goBack, type ViewerRoute } from '../lib/route'
import { recordRecent } from '../lib/recent'
import { Notice, PageBar } from '../components/ui'
import { ScoreViewer } from './ScoreViewer'
import { ImageViewer } from './ImageViewer'
import { PdfViewer } from './PdfViewer'
import { TextViewer } from './TextViewer'
import { OtherViewer } from './OtherViewer'
import { FileBar } from './Remote'

/** The score viewer page: a one-line header, then the file in the way its format can be shown. */
export function Viewer({ route }: { route: ViewerRoute }) {
  const path = route.path

  // Remember this score for 最近看过 once per opened file.
  useEffect(() => {
    if (path) recordRecent(route)
    // `route` is read for its fields; the file path identifies the opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  if (!path) {
    return (
      <>
        <PageBar title="看谱" fallback="#/" />
        <Notice tone="error">没有指定要看的文件。</Notice>
      </>
    )
  }

  const format: ScoreFormat = isScoreFormat(route.format) ? route.format : formatOfPath(path)
  const title = route.title || fileBaseName(path)
  const artist = route.artist
  const pages = route.pages.length > 0 ? route.pages : [path]
  const item = { path, format, pages, title, artist }

  let body: ReactNode
  let bar: ReactNode = null
  switch (format) {
    case 'score':
      body = (
        <ScoreViewer
          // Not keyed on the 改编谱: saving one puts its id in the address without reloading.
          key={path + route.combo + route.conv}
          path={path}
          title={title}
          artist={artist}
          pages={pages}
          band={route.band}
          showDrums={route.drums}
          combo={route.combo}
          conv={route.conv}
          arr={route.arr}
          rehearsal={route.rehearsal}
        />
      )
      break
    case 'image':
      body = <ImageViewer paths={pages} />
      bar = <FileBar item={item} downloadHref={fileUrl(path, true)} />
      break
    case 'pdf':
      body = <PdfViewer path={path} title={title} artist={artist} />
      bar = <FileBar item={item} downloadHref={fileUrl(path, true)} />
      break
    case 'text':
      body = <TextViewer path={path} />
      bar = <FileBar item={item} downloadHref={fileUrl(path, true)} />
      break
    default:
      body = <OtherViewer format={format} path={path} />
  }

  return (
    <div className="space-y-4 pb-6">
      <header className="gutter mx-auto flex w-full max-w-[1180px] items-center gap-2 pb-1 pt-3">
        <button
          type="button"
          aria-label="返回"
          onClick={() => goBack('#/')}
          className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-[hsl(var(--raised))] hover:text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <path
              d="M12.5 4.5 7 10l5.5 5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 min-w-0 break-words text-lg font-bold leading-snug min-[861px]:text-xl">
            {title}
          </h1>
          {/* Artist as a quiet line; the long file name only where there is room. */}
          <p className="m-0 flex min-w-0 items-baseline gap-x-2 text-[13px] text-muted-foreground">
            {artist && <span className="min-w-0 truncate">{artist}</span>}
            <span
              className="mono hidden min-w-0 truncate text-[11px] opacity-80 sm:inline"
              title={fileBaseName(path)}
            >
              {fileBaseName(path)}
            </span>
          </p>
        </div>
      </header>
      {/* The score runs edge to edge; pictures, PDFs and text keep the page gutter. */}
      {format === 'score' ? (
        body
      ) : (
        <div className="gutter mx-auto w-full max-w-[1180px]">{body}</div>
      )}
      {bar}
    </div>
  )
}
