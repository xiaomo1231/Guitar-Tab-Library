import { useSyncExternalStore } from 'react'

/** The page's colours: night (the default) or paper. Kept on this device. */
export type Theme = 'dark' | 'light'

export const THEME_KEY = 'gl-theme'
/** The browser bar's colour for each theme (the page background). */
export const THEME_COLOR: Record<Theme, string> = { dark: '#0f1114', light: '#f3f4f6' }

export function parseTheme(raw: string | null | undefined): Theme {
  return raw === 'light' ? 'light' : 'dark'
}

function stored(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY))
  } catch {
    return 'dark'
  }
}

let current: Theme = 'dark'
const listeners = new Set<() => void>()

function paint(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

/** Reads the saved theme and paints it; called once before the first render. */
export function startTheme(): void {
  current = stored()
  paint(current)
  // Another tab changed it: follow.
  window.addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY) return
    current = parseTheme(e.newValue)
    paint(current)
    listeners.forEach((l) => l())
  })
}

export function setTheme(theme: Theme): void {
  if (theme === current) return
  current = theme
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  paint(theme)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, () => current)
}
