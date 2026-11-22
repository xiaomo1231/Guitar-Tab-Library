import { useEffect, useState } from 'react'
import { api, type BandSong, errorText, type UploadSong } from '../../lib/api'
import { buttonClass, LIST, LIST_ROW } from '../../lib/classes'
import { hrefUpload, hrefViewer } from '../../lib/route'
import { Link } from '../../components/Link'
import { Notice } from '../../components/ui'

/** The member's own score files of this band song, or a link to upload them. */
export function OwnFiles({ song }: { song: BandSong }) {
  const uploadId = song.uploadId ?? null
  const [upload, setUpload] = useState<UploadSong | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uploadId) return
    let alive = true
    api.upload(uploadId).then(
      (u) => {
        if (alive) setUpload(u)
      },
      (e: unknown) => {
        if (alive) setError(errorText(e))
      },
    )
    return () => {
      alive = false
    }
  }, [uploadId])

  if (!uploadId) {
    return (
      <div className="space-y-3">
        <p className="m-0 text-sm leading-relaxed text-muted-foreground">
          觉得这首歌的谱不好用？可以上传自己的各声部谱（GP / MusicXML / PDF / 图片），再用「组合乐队谱」和原谱拼在一起。
        </p>
        <Link href={hrefUpload({ band: song.id })} className={buttonClass()}>
          上传自己的谱
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <Notice tone="error">{error}</Notice>}
      {!upload && !error && <p className="text-sm text-muted-foreground">正在读取…</p>}
      {upload &&
        (upload.files.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">还没有上传文件。</p>
        ) : (
          <ul className={`m-0 list-none p-0 ${LIST}`}>
            {upload.files.map((f) => (
              <li key={f.id} className={LIST_ROW}>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span className="mx-1.5 text-muted-foreground">·</span>
                  {f.name}
                </span>
                <Link
                  href={hrefViewer({
                    path: f.path,
                    format: f.kind === 'score' ? 'score' : f.kind,
                    title: upload.title,
                    artist: upload.artist,
                  })}
                  className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-primary hover:underline"
                >
                  看谱
                </Link>
              </li>
            ))}
          </ul>
        ))}
      <Link
        href={hrefUpload({ id: uploadId })}
        className="inline-flex min-h-11 items-center text-sm text-primary hover:underline"
      >
        管理上传的文件 →
      </Link>
    </div>
  )
}
