import { useState, type FormEvent } from 'react'
import type { UserInfo } from '@/songs/scoreServerTypes'
import { api, ApiError, errorText } from '../lib/api'
import { buttonClass, cx } from '../lib/classes'
import { navigate } from '../lib/route'

function loginMessage(e: unknown): string {
  if (e instanceof ApiError && e.status === 401) return '用户名或密码不对。'
  if (e instanceof ApiError && e.status === 429) return e.message
  return errorText(e)
}

export function LoginScreen({
  notice,
  onLoggedIn,
}: {
  notice: string | null
  onLoggedIn: (u: UserInfo) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(notice)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!username || !password || busy) return
    setBusy(true)
    setError(null)
    try {
      const user = await api.login(username, password)
      setPassword('')
      onLoggedIn(user)
    } catch (err) {
      setError(loginMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const field =
    'h-12 w-full rounded-lg border border-border bg-transparent px-4 text-base text-foreground outline-none transition-colors focus:border-primary'

  return (
    <main className="gutter grid min-h-dvh place-items-center bg-background py-10">
      <div className="w-full max-w-sm">
        <div className="rounded-[18px] border border-border bg-card p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-xl font-bold text-primary-foreground"
            >
              谱
            </span>
            <div className="min-w-0">
              <h1 className="m-0 font-display text-[28px] font-bold leading-tight">谱库</h1>
              <p className="m-0 text-[13px] text-muted-foreground">看谱、练习、乐队排练</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">用户名</span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={field}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">密码</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !username || !password}
              className={cx(buttonClass('primary'), 'h-12 w-full text-base font-bold')}
            >
              {busy ? '正在打开…' : '打开谱库'}
            </button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => navigate('#/invite')}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            没有账号？用邀请码注册
          </button>
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          只读：在这里看谱、下载，谱库里的文件不会被改动。
        </p>
      </div>
    </main>
  )
}
