import { getSettings } from './db'
import type { ThemePreference } from './types'

function resolveTheme(theme: ThemePreference) { return theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme }
export function applyTheme(theme: ThemePreference) { document.documentElement.dataset.theme = resolveTheme(theme); document.documentElement.style.colorScheme = resolveTheme(theme) }
void getSettings().then((settings) => applyTheme(settings.theme))
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => void getSettings().then((settings) => applyTheme(settings.theme)))
