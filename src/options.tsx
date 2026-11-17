import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Check,
  ChevronRight,
  Cloud,
  Code2,
  CreditCard,
  Crown,
  DatabaseBackup,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  HardDrive,
  Keyboard,
  LogOut,
  Moon,
  Palette,
  Receipt,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Tags,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { Brand } from './components/Brand'
import { PlanCatalogCards } from './components/PlanCatalogCards'
import { PlanUsageReport } from './components/PlanUsageReport'
import { displayPlanName } from './plans'
import { openPayPalCheckout } from './paypal'
import { resolveBillingProfile } from './billing'
import { createDriveBackup, previewRestore, restoreBundle } from './backup'
import { db, defaultSettings, getSettings } from './db'
import {
  deleteDriveBackup,
  downloadBackup,
  listDriveBackups,
  uploadMarkdownExport,
  type DriveBackup,
} from './drive'
import { sendMessage } from './lib'
import {
  defaultMarkdownOptions,
  itemToMarkdown,
  itemsToCsv,
  libraryToMarkdown,
  safeExportName,
} from './markdown'
import { deleteCollection, deleteItem, exportLibrary, saveTagRule } from './repository'
import { applyTheme } from './theme'
import type {
  BackupRetention,
  MarkdownExportOptions,
  RestoreMode,
  TagRule,
  ThemePreference,
} from './types'
import { createZip } from './zip'
import './index.css'

type SettingsSection =
  | 'account'
  | 'plan'
  | 'appearance'
  | 'smart-tags'
  | 'exports'
  | 'backup'
  | 'shortcuts'
  | 'privacy'

type BillingPlan = 'free' | 'professional' | 'team' | 'business' | 'ai'
type PaymentRecord = {
  id: string
  date: string
  plan: string
  amount: number
  currency: string
  status: 'paid' | 'refunded' | 'failed' | 'pending'
  receiptUrl?: string
}
type BillingProfile = {
  plan: BillingPlan
  renewalDate?: string
  payments: PaymentRecord[]
  assignedEmail?: string
  entitlementSource?: 'identity-allowlist' | 'local'
  freeAccessStartedAt?: string
}

const navigation: Array<{
  id: SettingsSection
  label: string
  description: string
  icon: typeof Cloud
}> = [
  { id: 'account', label: 'Drive & sync', description: 'Account and automation', icon: Cloud },
  { id: 'plan', label: 'Plan & billing', description: 'Subscription and payments', icon: CreditCard },
  { id: 'appearance', label: 'Appearance', description: 'Theme preferences', icon: Palette },
  { id: 'smart-tags', label: 'Smart tags', description: 'Local classification rules', icon: Tags },
  { id: 'exports', label: 'Export center', description: 'Portable library formats', icon: Code2 },
  { id: 'backup', label: 'Backup & restore', description: 'Recovery and history', icon: DatabaseBackup },
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'Work faster', icon: Keyboard },
  { id: 'privacy', label: 'Privacy & data', description: 'Permissions and deletion', icon: ShieldCheck },
]

const sectionCopy: Record<SettingsSection, { eyebrow: string; title: string; description: string }> = {
  account: {
    eyebrow: 'Cloud workspace',
    title: 'Drive & sync',
    description: 'Control your Google Drive connection and keep offline changes safely synchronized.',
  },
  plan: {
    eyebrow: 'Membership',
    title: 'Plan & billing',
    description: 'Compare LilacSave plans, review your membership, and access payment history.',
  },
  appearance: {
    eyebrow: 'Personalization',
    title: 'Appearance',
    description: 'Choose how LilacSave looks across the dashboard, side panel, and settings.',
  },
  'smart-tags': {
    eyebrow: 'Local automation',
    title: 'Smart tagging rules',
    description: 'Automatically suggest consistent tags without sending your content to an AI service.',
  },
  exports: {
    eyebrow: 'Portability',
    title: 'Export center',
    description: 'Take your library to Markdown, JSON, CSV, Obsidian, or your own Google Drive.',
  },
  backup: {
    eyebrow: 'Recovery',
    title: 'Backup & restore',
    description: 'Create validated snapshots and restore safely with a mode that fits your situation.',
  },
  shortcuts: {
    eyebrow: 'Productivity',
    title: 'Keyboard shortcuts',
    description: 'Review global Chrome shortcuts and the commands available inside the dashboard.',
  },
  privacy: {
    eyebrow: 'Your data',
    title: 'Privacy & data controls',
    description: 'Understand permissions and manage local or synchronized data with confidence.',
  },
}

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function Options() {
  const [section, setSection] = useState<SettingsSection>(() => window.location.hash === '#plan' ? 'plan' : 'account')
  const [billing, setBilling] = useState<BillingProfile>({ plan: 'free', payments: [] })
  const [authenticated, setAuthenticated] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [rootFolder, setRootFolder] = useState<string>()
  const [lastSync, setLastSync] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [backups, setBackups] = useState<DriveBackup[]>([])
  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge')
  const [scheduledBackups, setScheduledBackups] = useState(false)
  const [retention, setRetention] = useState<BackupRetention>(5)
  const [exportOptions, setExportOptions] = useState<MarkdownExportOptions>(defaultMarkdownOptions)
  const [tagRules, setTagRules] = useState<TagRule[]>([])
  const [ruleName, setRuleName] = useState('')
  const [ruleField, setRuleField] = useState<TagRule['field']>('domain')
  const [ruleValue, setRuleValue] = useState('')
  const [ruleTags, setRuleTags] = useState('')
  const [commands, setCommands] = useState<chrome.commands.Command[]>([])
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getSettings().then((value) => {
      setAutoSync(value.autoSync)
      setTheme(value.theme)
      setRootFolder(value.driveFolders.root)
      setLastSync(value.lastSyncAt)
      setScheduledBackups(value.scheduledBackups)
      setRetention(value.backupRetention)
    })
    void db.tagRules.toArray().then(setTagRules)
    void chrome.commands.getAll().then(setCommands)
    void resolveBillingProfile().then(({ profile }) => setBilling(profile))
    void sendMessage<boolean>({ type: 'AUTH_STATUS' }).then(async (value) => {
      const connected = Boolean(value.data)
      setAuthenticated(connected)
      if (connected) {
        try {
          setBackups(await listDriveBackups())
        } catch {
          // Sync UI reports Drive errors separately.
        }
      }
    })
  }, [])

  async function connect() {
    setBusy(true)
    const response = await sendMessage({ type: 'SIGN_IN' })
    setBusy(false)
    setAuthenticated(response.ok)
    setStatus(response.ok ? 'Google Drive connected and synchronized.' : response.error || 'Connection failed.')
    const settings = await getSettings()
    setRootFolder(settings.driveFolders.root)
    setLastSync(settings.lastSyncAt)
  }

  async function disconnect() {
    setBusy(true)
    const response = await sendMessage({ type: 'SIGN_OUT' })
    setBusy(false)
    if (response.ok) {
      setAuthenticated(false)
      setRootFolder(undefined)
      setStatus('Disconnected. Local data remains available.')
    }
  }

  async function savePreferences(changes: Partial<Awaited<ReturnType<typeof getSettings>>>) {
    const current = await getSettings()
    await db.settings.put({ ...current, ...changes })
    if (changes.theme) applyTheme(changes.theme)
    setStatus('Settings saved.')
  }

  async function manualSync() {
    setBusy(true)
    const result = await sendMessage({ type: 'SYNC_NOW', interactive: !authenticated })
    setBusy(false)
    setStatus(result.ok ? 'Synchronization completed.' : result.error || 'Synchronization failed.')
    if (result.ok) {
      setAuthenticated(true)
      const settings = await getSettings()
      setLastSync(settings.lastSyncAt)
      setRootFolder(settings.driveFolders.root)
    }
  }

  async function exportJson() {
    const bundle = await exportLibrary()
    saveBlob(
      `lilacsave-backup-${new Date().toISOString().slice(0, 10)}.json`,
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
    )
    setStatus('Validated JSON backup created.')
  }

  async function exportMarkdown(target: 'download' | 'drive') {
    const items = await db.items.toArray()
    const collections = new Map(
      (await db.collections.toArray()).map((collection) => [collection.id, collection.name]),
    )
    const markdown = libraryToMarkdown(items, collections, exportOptions)
    const name = `lilacsave-export-${new Date().toISOString().slice(0, 10)}.md`

    if (target === 'drive') {
      setBusy(true)
      try {
        await uploadMarkdownExport(name, markdown)
        setStatus('Markdown saved to Lilac Save/Exports in Google Drive.')
      } finally {
        setBusy(false)
      }
    } else if (exportOptions.individualFiles) {
      saveBlob(
        name.replace(/\.md$/, '.zip'),
        createZip(
          items
            .filter((item) => !item.deletedAt)
            .map((item) => ({
              name: safeExportName(item.title),
              content: itemToMarkdown(
                item,
                collections.get(item.collectionId || '') || '',
                exportOptions,
              ),
            })),
        ),
      )
      setStatus('Individual Markdown files exported as ZIP.')
    } else {
      saveBlob(name, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
      setStatus('Markdown export created.')
    }
  }

  async function exportCsv() {
    const collections = new Map(
      (await db.collections.toArray()).map((collection) => [collection.id, collection.name]),
    )
    saveBlob(
      `lilacsave-export-${new Date().toISOString().slice(0, 10)}.csv`,
      new Blob([itemsToCsv(await db.items.toArray(), collections)], {
        type: 'text/csv;charset=utf-8',
      }),
    )
    setStatus('CSV export created.')
  }

  async function uploadDriveBackup() {
    setBusy(true)
    try {
      await createDriveBackup('manual')
      setBackups(await listDriveBackups())
      setStatus('Full backup saved to Google Drive.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function restoreValue(value: unknown, label: string) {
    try {
      const { preview } = await previewRestore(value)
      if (
        !confirm(
          `${label}\n\n${preview.items} items, ${preview.collections} collections\n${preview.newItems} new, ${preview.updatedItems} newer, ${preview.duplicates} unchanged\n\nRestore mode: ${restoreMode}?${restoreMode === 'replace' ? '\nA safety backup will be created first.' : ''}`,
        )
      )
        return
      setBusy(true)
      const result = await restoreBundle(value, restoreMode)
      setStatus(
        `Restore complete: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Restore failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file?: File) {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      setStatus('Import file is too large.')
      return
    }
    try {
      await restoreValue(JSON.parse(await file.text()) as unknown, `Restore ${file.name}?`)
    } catch {
      setStatus('The selected file is not valid JSON.')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  async function restoreSelectedBackup(backup: DriveBackup) {
    await restoreValue(await downloadBackup(backup.id), `Restore ${backup.name}?`)
  }

  async function removeBackup(backup: DriveBackup) {
    if (!confirm(`Permanently delete ${backup.name} from Google Drive?`)) return
    await deleteDriveBackup(backup.id)
    setBackups(await listDriveBackups())
    setStatus('Backup deleted.')
  }

  async function addRule() {
    if (!ruleName.trim() || !ruleValue.trim() || !ruleTags.trim()) return
    await saveTagRule({
      name: ruleName,
      field: ruleField,
      operator: 'contains',
      value: ruleValue,
      tags: ruleTags.split(','),
      enabled: true,
    })
    setTagRules(await db.tagRules.toArray())
    setRuleName('')
    setRuleValue('')
    setRuleTags('')
    setStatus('Smart tag rule saved locally.')
  }

  async function clearLocal() {
    if (
      !confirm(
        'Clear all local LilacSave data on this device? Synced Drive data is not deleted and can be downloaded again.',
      )
    )
      return
    await db.delete()
    await db.open()
    await db.settings.put(defaultSettings)
    setStatus('Local data cleared.')
  }

  async function deleteEverywhere() {
    if (
      !confirm(
        'Move every item and collection to the deletion queue? This removes their LilacSave Drive records after sync.',
      )
    )
      return
    for (const item of await db.items.toArray()) await deleteItem(item.id)
    for (const collection of await db.collections.toArray()) await deleteCollection(collection.id)
    await manualSync()
    setStatus('Library deletion synchronized.')
  }

  const themeOptions: Array<{
    id: ThemePreference
    label: string
    description: string
    icon: typeof Sun
    preview: string
  }> = [
    {
      id: 'light',
      label: 'Light',
      description: 'Bright and clean',
      icon: Sun,
      preview: 'bg-white border-slate-200',
    },
    {
      id: 'dark',
      label: 'Dark',
      description: 'Comfortable at night',
      icon: Moon,
      preview: 'bg-[#21192f] border-[#3f3158]',
    },
    {
      id: 'system',
      label: 'System',
      description: 'Match your device',
      icon: HardDrive,
      preview: 'bg-gradient-to-r from-white to-[#21192f] border-lilac-200',
    },
  ]
  const commandLabels: Record<string, string> = {
    'open-side-panel': 'Open LilacSave',
    'save-current-page': 'Save current page',
    'save-selected-text': 'Save selected text',
    'new-note': 'New note',
    'sync-now': 'Sync now',
  }
  const optionLabels: Array<[keyof MarkdownExportOptions, string]> = [
    ['includeUrls', 'Include URLs'],
    ['includeTags', 'Include tags'],
    ['includeDates', 'Include dates'],
    ['includeNotes', 'Include personal notes'],
    ['includeHighlights', 'Include highlights'],
    ['includeCollections', 'Include collection names'],
    ['yamlFrontMatter', 'YAML front matter'],
    ['individualFiles', 'Individual files in ZIP'],
  ]
  const activeCopy = sectionCopy[section]

  return (
    <main className="settings-shell min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(196,163,255,.18),transparent_28%),radial-gradient(circle_at_92%_14%,rgba(139,92,246,.10),transparent_24%),#f8f6fc] text-[#241B35]">
      <div className="settings-topbar sticky top-0 z-40 border-b border-[#ece8f2] bg-white/90 px-4 py-3 shadow-[0_8px_30px_rgba(53,38,74,.04)] backdrop-blur-xl sm:px-7">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Brand />
            <span className="hidden rounded-full border border-lilac-100 bg-lilac-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-lilac-700 md:inline-flex">Professional workspace</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`hidden items-center gap-2 rounded-full px-3 py-2 text-xs font-bold sm:flex ${
                authenticated ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${authenticated ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              {authenticated ? 'Drive connected' : 'Offline mode'}
            </span>
            <a href={chrome.runtime.getURL('dashboard.html')} className="inline-flex items-center gap-1.5 rounded-xl bg-[#2c1d3d] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(44,29,61,.18)] transition hover:-translate-y-0.5 hover:bg-[#3b2750] sm:px-4">
              <span className="hidden sm:inline">Back to library</span>
              <span className="sm:hidden">Library</span>
              <ChevronRight size={15} />
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 lg:py-8">
        <div className="settings-hero relative mb-6 overflow-hidden rounded-[30px] bg-[linear-gradient(120deg,#21132f_0%,#3d1c63_50%,#6d35c5_100%)] px-5 py-7 text-white shadow-[0_24px_60px_rgba(75,38,122,.20)] sm:px-8 sm:py-8 lg:px-10">
          <div className="pointer-events-none absolute -right-20 -top-44 h-96 w-96 rounded-full border-[55px] border-white/[.045]" />
          <div className="pointer-events-none absolute bottom-[-90px] left-[38%] h-52 w-52 rounded-full bg-fuchsia-400/15 blur-3xl" />
          <div className="relative grid items-center gap-7 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[.08] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.2em] text-lilac-100 backdrop-blur-sm">
                <Settings2 size={11} /> Workspace control center
              </div>
              <h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl lg:text-[42px]">Settings built around you.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">Manage your workspace, cloud connection, membership, exports, and privacy from one focused place.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 md:w-[360px]">
              <button type="button" onClick={() => setSection('account')} className="group rounded-2xl border border-white/10 bg-white/[.075] p-3 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[.13]">
                <Cloud size={16} className="text-emerald-300" />
                <span className="mt-3 block text-[9px] font-black uppercase tracking-wider text-white/40">Cloud</span>
                <span className="mt-0.5 block truncate text-xs font-extrabold">{authenticated ? 'Connected' : 'Offline'}</span>
              </button>
              <button type="button" onClick={() => setSection('plan')} className="group rounded-2xl border border-white/10 bg-white/[.075] p-3 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[.13]">
                <Crown size={16} className="text-amber-300" />
                <span className="mt-3 block text-[9px] font-black uppercase tracking-wider text-white/40">Plan</span>
                <span className="mt-0.5 block truncate text-xs font-extrabold capitalize">{billing.plan === 'ai' ? 'AI' : billing.plan}</span>
              </button>
              <button type="button" onClick={() => setSection('appearance')} className="group rounded-2xl border border-white/10 bg-white/[.075] p-3 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/[.13]">
                <Palette size={16} className="text-fuchsia-300" />
                <span className="mt-3 block text-[9px] font-black uppercase tracking-wider text-white/40">Theme</span>
                <span className="mt-0.5 block truncate text-xs font-extrabold capitalize">{theme}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside>
            <nav
              aria-label="Settings sections"
              className="settings-nav flex gap-2 overflow-x-auto rounded-3xl border border-white bg-white/80 p-2 shadow-[0_18px_55px_rgba(64,42,93,.08)] lg:sticky lg:top-24 lg:block lg:space-y-1 lg:overflow-visible"
            >
              {navigation.map((item) => {
                const Icon = item.icon
                const active = section === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`group flex min-w-[168px] items-center gap-3 rounded-2xl px-3 py-3 text-left transition lg:w-full lg:min-w-0 ${
                      active
                        ? 'bg-gradient-to-r from-[#7C3AED] to-[#9B5CF6] text-white shadow-[0_10px_25px_rgba(124,58,237,.22)]'
                        : 'text-[#62566f] hover:bg-lilac-50 hover:text-lilac-800'
                    }`}
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                        active ? 'bg-white/16' : 'bg-lilac-50 text-lilac-700 group-hover:bg-white'
                      }`}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold">{item.label}</span>
                      <span
                        className={`mt-0.5 hidden truncate text-[10px] lg:block ${
                          active ? 'text-white/70' : 'text-[#9b91a6]'
                        }`}
                      >
                        {item.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>
          </aside>

          <section className="settings-panel min-w-0 overflow-hidden rounded-[30px] border border-white bg-white shadow-[0_24px_70px_rgba(64,42,93,.09)]">
            <header className="settings-panel-header relative overflow-hidden border-b border-lilac-50 bg-[linear-gradient(120deg,#fcfaff_0%,#f4ecff_58%,#eee4ff_100%)] px-5 py-7 sm:px-8">
              <div className="absolute -right-10 -top-20 h-52 w-52 rounded-full bg-lilac-300/20 blur-2xl" />
              <div className="relative">
                <div className="text-[10px] font-black uppercase tracking-[.2em] text-lilac-600">
                  {activeCopy.eyebrow}
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-[-.025em] text-[#2b203d]">
                  {activeCopy.title}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B85]">
                  {activeCopy.description}
                </p>
              </div>
            </header>

            <div className="p-5 sm:p-8">
              {section === 'account' && (
                <div className="space-y-6">
                  <div className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,#2e174e_0%,#5b21b6_54%,#8b5cf6_100%)] p-6 text-white sm:p-7">
                    <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[28px] border-white/5" />
                    <div className="relative flex flex-wrap items-start justify-between gap-5">
                      <div className="flex gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20">
                          <Cloud size={23} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-extrabold">Google Drive</h3>
                            <span className="rounded-full bg-white/12 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/80">
                              Primary cloud
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-white/68">
                            {authenticated
                              ? 'Your offline library is connected and ready to synchronize.'
                              : 'Connect your account when you are ready. Local saving already works.'}
                          </p>
                        </div>
                      </div>
                      {authenticated ? (
                        <button disabled={busy} onClick={() => void disconnect()} className="rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 transition hover:bg-white/16 disabled:opacity-50">
                          <LogOut size={15} className="mr-2 inline" /> Disconnect
                        </button>
                      ) : (
                        <button disabled={busy} onClick={() => void connect()} className="rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-lilac-800 shadow-lg transition hover:-translate-y-0.5 disabled:opacity-50">
                          <ExternalLink size={15} className="mr-2 inline" /> Connect account
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Connection</div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-700">
                        <span className={`h-2.5 w-2.5 rounded-full ${authenticated ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        {authenticated ? 'Connected' : 'Local only'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Last sync</div>
                      <div className="mt-2 truncate text-sm font-extrabold text-slate-700">
                        {lastSync ? new Date(lastSync).toLocaleString() : 'Not synced yet'}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Drive folder</div>
                      <div className="mt-2 truncate text-sm font-extrabold text-slate-700">
                        {rootFolder ? 'Lilac Save ready' : 'Created on first sync'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 p-1">
                    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-4 transition hover:bg-slate-50">
                      <span>
                        <span className="block text-sm font-extrabold text-slate-700">Automatic synchronization</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">Retry queued offline changes every five minutes when Drive is available.</span>
                      </span>
                      <input type="checkbox" checked={autoSync} onChange={(event) => { setAutoSync(event.target.checked); void savePreferences({ autoSync: event.target.checked }) }} className="h-5 w-5 shrink-0 accent-lilac-600" />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button disabled={busy} onClick={() => void manualSync()} className="btn-primary">
                      <RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Sync now
                    </button>
                    {rootFolder && (
                      <a href={`https://drive.google.com/drive/folders/${rootFolder}`} target="_blank" rel="noreferrer" className="btn-secondary">
                        <FolderOpen size={15} /> Open Drive folder
                      </a>
                    )}
                  </div>
                </div>
              )}

              {section === 'plan' && (
                <div className="space-y-8">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-lilac-100 bg-[linear-gradient(135deg,#faf7ff,#f1e8ff)] p-5 sm:p-6">
                    <div className="flex items-center gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-lilac-700 shadow-sm">
                        <Crown size={22} />
                      </span>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[.16em] text-lilac-600">Current plan</div>
                        <h3 className="mt-1 text-lg font-black capitalize text-lilac-950">
                          {displayPlanName(billing.plan)}
                        </h3>
                        <p className="mt-1 text-xs text-lilac-900/55">
                          {billing.renewalDate
                            ? `Renews ${new Date(billing.renewalDate).toLocaleDateString()}`
                            : billing.entitlementSource === 'identity-allowlist' && billing.assignedEmail
                              ? `Professional access for ${billing.assignedEmail}`
                              : billing.plan === 'free'
                              ? 'No payment method required'
                              : 'Annual membership'}
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full border border-lilac-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-lilac-700">
                      {billing.entitlementSource === 'identity-allowlist' ? 'Assigned access' : billing.plan === 'free' ? 'Active' : 'Billing plan'}
                    </span>
                  </div>

                  <PlanUsageReport billing={billing} />

                  <div>
                    <div className="mb-4">
                      <h3 className="text-sm font-extrabold text-slate-700">Choose the plan that fits your library</h3>
                      <p className="mt-1 text-xs text-slate-400">Prices are billed annually in US dollars.</p>
                    </div>
                    <div className="payment-plan-grid grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      <PlanCatalogCards currentPlan={billing.plan} onMessage={setStatus} onCheckout={async (plan, cycle) => { try { await openPayPalCheckout(plan, cycle); setStatus('PayPal checkout opened in a secure browser tab.') } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not open PayPal checkout.') } }} />
                      <article className={`flex flex-col rounded-[24px] border p-5 ${billing.plan === 'free' ? 'border-lilac-300 bg-lilac-50/35' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-500">Free</span>
                          {billing.plan === 'free' && <span className="rounded-full bg-lilac-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-lilac-700">Current</span>}
                        </div>
                        <div className="mt-4 flex items-end gap-1"><span className="text-4xl font-black tracking-tight text-[#2b203d]">$0</span><span className="pb-1 text-xs font-semibold text-slate-400">forever</span></div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">The essential offline-first library for saving what matters.</p>
                        <ul className="mt-5 flex-1 space-y-2.5 text-xs font-semibold text-slate-600">
                          {['Save URLs, text, links, and notes', 'Collections and search', 'Google Drive backup and sync'].map((feature) => <li key={feature} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />{feature}</li>)}
                        </ul>
                        <button type="button" disabled className="mt-6 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-extrabold text-slate-400">{billing.plan === 'free' ? 'Your current plan' : 'Included features'}</button>
                      </article>

                      <article className={`relative flex flex-col overflow-hidden rounded-[24px] border p-5 ${billing.plan === 'professional' ? 'border-lilac-400 bg-lilac-50/35' : 'border-lilac-200 bg-[linear-gradient(145deg,#ffffff,#faf6ff)] shadow-[0_14px_35px_rgba(124,58,237,.09)]'}`}>
                        <div className="absolute right-0 top-0 rounded-bl-2xl bg-lilac-600 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-white">Popular</div>
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-lilac-700"><Crown size={15} /> Professional</div>
                        <div className="mt-4 flex items-end gap-1"><span className="text-4xl font-black tracking-tight text-[#2b203d]">$12</span><span className="pb-1 text-xs font-semibold text-slate-400">/year</span></div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">More power and structure for growing knowledge libraries.</p>
                        <ul className="mt-5 flex-1 space-y-2.5 text-xs font-semibold text-slate-600">
                          {['Advanced search and smart tagging', 'Markdown export and organization', 'Enhanced backup and shortcuts'].map((feature) => <li key={feature} className="flex gap-2"><Sparkles size={14} className="mt-0.5 shrink-0 text-lilac-500" />{feature}</li>)}
                        </ul>
                        {billing.plan === 'professional' ? (
                          <button type="button" disabled className="mt-6 rounded-xl bg-lilac-100 px-4 py-2.5 text-xs font-extrabold text-lilac-700">Your current plan</button>
                        ) : (
                          <button type="button" onClick={() => setStatus('Secure checkout is not configured yet. Connect a payment provider before accepting upgrades.')} className="mt-6 rounded-xl bg-lilac-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-lilac-200 transition hover:bg-lilac-700">Choose Professional</button>
                        )}
                      </article>

                      <article className={`flex flex-col rounded-[24px] border p-5 ${billing.plan === 'ai' ? 'border-fuchsia-400 bg-fuchsia-50/35' : 'border-fuchsia-100 bg-[linear-gradient(145deg,#fff,#fff8ff)]'}`}>
                        <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-fuchsia-700"><Zap size={15} /> AI Knowledge Manager</span><span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-fuchsia-600">Planned</span></div>
                        <div className="mt-4 flex items-end gap-1"><span className="text-4xl font-black tracking-tight text-[#2b203d]">$129</span><span className="pb-1 text-xs font-semibold text-slate-400">/year</span></div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">Turn saved content into an intelligent research workspace.</p>
                        <ul className="mt-5 flex-1 space-y-2.5 text-xs font-semibold text-slate-600">
                          {['AI summaries and AI search', 'Automatic categorization', 'Related content and research assistant'].map((feature) => <li key={feature} className="flex gap-2"><Zap size={14} className="mt-0.5 shrink-0 text-fuchsia-500" />{feature}</li>)}
                        </ul>
                        <button type="button" onClick={() => setStatus('AI Knowledge Manager is planned for Version 3.0 and is not available for purchase yet.')} className="mt-6 rounded-xl border border-fuchsia-200 bg-white px-4 py-2.5 text-xs font-extrabold text-fuchsia-700 transition hover:bg-fuchsia-50">Join the future plan</button>
                      </article>
                    </div>
                  </div>

                  <div>
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div><h3 className="text-sm font-extrabold text-slate-700">Payment history</h3><p className="mt-1 text-xs text-slate-400">Invoices and completed membership payments will appear here.</p></div>
                      {billing.payments.length > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">{billing.payments.length} payment{billing.payments.length === 1 ? '' : 's'}</span>}
                    </div>
                    {billing.payments.length ? (
                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full min-w-[620px] text-left">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-400"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Receipt</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {billing.payments.map((payment) => (
                              <tr key={payment.id} className="text-xs text-slate-600"><td className="whitespace-nowrap px-4 py-4 font-semibold">{new Date(payment.date).toLocaleDateString()}</td><td className="px-4 py-4 font-bold">{payment.plan}</td><td className="whitespace-nowrap px-4 py-4 font-bold">{new Intl.NumberFormat(undefined, { style: 'currency', currency: payment.currency }).format(payment.amount)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${payment.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : payment.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{payment.status}</span></td><td className="px-4 py-4 text-right">{payment.receiptUrl ? <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="font-extrabold text-lilac-700 hover:underline">View receipt</a> : <span className="text-slate-300">Unavailable</span>}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 py-11 text-center"><span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-slate-300"><Receipt size={20} /></span><p className="mt-3 text-sm font-extrabold text-slate-500">No payments yet</p><p className="mt-1 text-xs text-slate-400">{billing.entitlementSource === 'identity-allowlist' ? 'Professional access was assigned to this Google account; no payment record was created.' : `Your ${billing.plan === 'ai' ? 'AI Knowledge Manager' : billing.plan} plan has no invoices.`}</p></div>
                    )}
                  </div>
                </div>
              )}

              {section === 'appearance' && (
                <div className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {themeOptions.map(({ id, label, description, icon: Icon, preview }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setTheme(id); void savePreferences({ theme: id }) }}
                        className={`relative overflow-hidden rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${theme === id ? 'border-lilac-500 bg-lilac-50/50 shadow-[0_12px_30px_rgba(124,58,237,.12)]' : 'border-slate-100 bg-white'}`}
                      >
                        {theme === id && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-lilac-600 text-white"><Check size={13} /></span>}
                        <div className={`mb-4 h-28 overflow-hidden rounded-xl border ${preview}`}>
                          <div className="m-3 h-3 w-16 rounded-full bg-lilac-400/60" />
                          <div className="mx-3 mt-4 grid grid-cols-[28px_1fr] gap-2">
                            <span className="h-16 rounded-lg bg-lilac-500/35" />
                            <span className="h-16 rounded-lg bg-lilac-300/25" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-700"><Icon size={16} className="text-lilac-600" />{label}</div>
                        <p className="mt-1 text-xs text-slate-400">{description}</p>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-lilac-100 bg-lilac-50/60 p-4 text-xs leading-5 text-lilac-900/70">
                    Your theme is applied immediately and saved only as a display preference. It does not affect exported content.
                  </div>
                </div>
              )}

              {section === 'smart-tags' && (
                <div className="space-y-6">
                  <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 md:grid-cols-2">
                    <label className="text-xs font-bold text-slate-500">Rule name<input value={ruleName} onChange={(event) => setRuleName(event.target.value)} className="field mt-2 bg-white" placeholder="e.g. Design resources" /></label>
                    <label className="text-xs font-bold text-slate-500">Match field<select value={ruleField} onChange={(event) => setRuleField(event.target.value as TagRule['field'])} className="field mt-2 bg-white"><option value="domain">Domain contains</option><option value="title">Title contains</option><option value="content">Content contains</option></select></label>
                    <label className="text-xs font-bold text-slate-500">Keyword or domain<input value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} className="field mt-2 bg-white" placeholder="figma.com" /></label>
                    <label className="text-xs font-bold text-slate-500">Suggested tags<input value={ruleTags} onChange={(event) => setRuleTags(event.target.value)} className="field mt-2 bg-white" placeholder="design, inspiration" /></label>
                    <div className="md:col-span-2"><button disabled={!ruleName.trim() || !ruleValue.trim() || !ruleTags.trim()} onClick={() => void addRule()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-45"><Sparkles size={15} /> Create local rule</button></div>
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-slate-700">Active rules</h3><span className="rounded-full bg-lilac-50 px-2.5 py-1 text-[10px] font-black text-lilac-700">{tagRules.length} total</span></div>
                    {tagRules.length ? (
                      <div className="space-y-2">
                        {tagRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 p-4 transition hover:border-lilac-100 hover:bg-lilac-50/30">
                            <div className="min-w-0"><div className="text-sm font-extrabold text-slate-700">{rule.name}</div><div className="mt-1 truncate text-xs text-slate-400">{rule.field} contains “{rule.value}”</div><div className="mt-2 flex flex-wrap gap-1">{rule.tags.map((tag) => <span key={tag} className="rounded-full bg-lilac-50 px-2 py-1 text-[10px] font-bold text-lilac-700">#{tag.trim()}</span>)}</div></div>
                            <button aria-label={`Delete ${rule.name}`} onClick={() => void db.tagRules.delete(rule.id).then(async () => setTagRules(await db.tagRules.toArray()))} className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center"><Tags size={24} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">No smart tag rules yet</p><p className="mt-1 text-xs text-slate-400">Create your first rule above.</p></div>
                    )}
                  </div>
                </div>
              )}

              {section === 'exports' && (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {optionLabels.map(([key, label]) => (
                      <label key={key} className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 text-xs font-bold transition ${exportOptions[key] ? 'border-lilac-200 bg-lilac-50 text-lilac-900' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                        {label}<input type="checkbox" checked={exportOptions[key]} onChange={(event) => setExportOptions((current) => ({ ...current, [key]: event.target.checked }))} className="h-4 w-4 shrink-0 accent-lilac-600" />
                      </label>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button onClick={() => void exportMarkdown('download')} className="group rounded-2xl border border-slate-100 p-5 text-left transition hover:border-lilac-200 hover:bg-lilac-50/40 hover:shadow-lg"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lilac-100 text-lilac-700"><FileText size={19} /></span><span className="mt-4 block text-sm font-extrabold text-slate-700">Download Markdown</span><span className="mt-1 block text-xs leading-5 text-slate-400">A single portable file, or a ZIP when individual files are selected.</span></button>
                    <button disabled={!authenticated || busy} onClick={() => void exportMarkdown('drive')} className="group rounded-2xl border border-slate-100 p-5 text-left transition hover:border-lilac-200 hover:bg-lilac-50/40 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Upload size={19} /></span><span className="mt-4 block text-sm font-extrabold text-slate-700">Save Markdown to Drive</span><span className="mt-1 block text-xs leading-5 text-slate-400">Place a readable copy in the Lilac Save/Exports folder.</span></button>
                    <button onClick={() => void exportJson()} className="group rounded-2xl border border-slate-100 p-5 text-left transition hover:border-lilac-200 hover:bg-lilac-50/40 hover:shadow-lg"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Download size={19} /></span><span className="mt-4 block text-sm font-extrabold text-slate-700">Export validated JSON</span><span className="mt-1 block text-xs leading-5 text-slate-400">Best for complete LilacSave backup and restore workflows.</span></button>
                    <button onClick={() => void exportCsv()} className="group rounded-2xl border border-slate-100 p-5 text-left transition hover:border-lilac-200 hover:bg-lilac-50/40 hover:shadow-lg"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700"><Download size={19} /></span><span className="mt-4 block text-sm font-extrabold text-slate-700">Export spreadsheet CSV</span><span className="mt-1 block text-xs leading-5 text-slate-400">Use your saved library in spreadsheets and data tools.</span></button>
                  </div>
                </div>
              )}

              {section === 'backup' && (
                <div className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs"><span className="mb-2 block font-extrabold text-slate-600">Restore mode</span><select value={restoreMode} onChange={(event) => setRestoreMode(event.target.value as RestoreMode)} className="field bg-white py-2"><option value="merge">Merge newer records</option><option value="missing">Missing items only</option><option value="replace">Replace library</option></select></label>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"><span><span className="block text-xs font-extrabold text-slate-600">Daily backup</span><span className="mt-1 block text-[10px] leading-4 text-slate-400">Automatic Drive snapshot</span></span><input type="checkbox" checked={scheduledBackups} onChange={(event) => { setScheduledBackups(event.target.checked); void savePreferences({ scheduledBackups: event.target.checked }) }} className="h-5 w-5 accent-lilac-600" /></label>
                    <label className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs"><span className="mb-2 block font-extrabold text-slate-600">Scheduled retention</span><select value={String(retention)} onChange={(event) => { const value = event.target.value === 'manual' ? 'manual' : Number(event.target.value) as 5 | 10; setRetention(value); void savePreferences({ backupRetention: value }) }} className="field bg-white py-2"><option value="5">Keep last 5</option><option value="10">Keep last 10</option><option value="manual">Manual</option></select></label>
                  </div>
                  <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleImport(event.target.files?.[0])} />
                  <div className="flex flex-wrap gap-2"><button onClick={() => importRef.current?.click()} className="btn-secondary"><Upload size={15} /> Restore local JSON</button><button disabled={!authenticated || busy} onClick={() => void uploadDriveBackup()} className="btn-primary"><DatabaseBackup size={15} /> Back up to Drive</button></div>
                  <div>
                    <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-extrabold text-slate-700">Drive backup history</h3><span className="text-xs text-slate-400">Latest 10</span></div>
                    {backups.length ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-100">
                        {backups.slice(0, 10).map((backup, index) => (
                          <div key={backup.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${index ? 'border-t border-slate-100' : ''}`}><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lilac-50 text-lilac-700"><DatabaseBackup size={16} /></span><div className="min-w-0"><div className="truncate text-xs font-extrabold text-slate-700">{backup.name}</div><div className="mt-1 text-[10px] text-slate-400">{new Date(backup.createdTime).toLocaleString()} · {backup.size ? `${Math.ceil(Number(backup.size) / 1024)} KB` : 'Size unavailable'}</div></div></div><div className="flex gap-1"><button disabled={busy} onClick={() => void restoreSelectedBackup(backup)} className="rounded-lg px-3 py-2 text-[10px] font-extrabold text-lilac-700 transition hover:bg-lilac-50">Restore</button><button disabled={busy} onClick={() => void removeBackup(backup)} className="rounded-lg px-3 py-2 text-[10px] font-extrabold text-rose-600 transition hover:bg-rose-50">Delete</button></div></div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center"><DatabaseBackup size={24} className="mx-auto text-slate-300" /><p className="mt-3 text-sm font-bold text-slate-500">No Drive backups found</p><p className="mt-1 text-xs text-slate-400">Connect Drive and create your first recovery point.</p></div>
                    )}
                  </div>
                </div>
              )}

              {section === 'shortcuts' && (
                <div className="space-y-6">
                  <div className="overflow-hidden rounded-2xl border border-slate-100">
                    {commands.map((command, index) => (
                      <div key={command.name} className={`flex items-center justify-between gap-4 px-4 py-4 ${index ? 'border-t border-slate-100' : ''}`}><span className="flex items-center gap-3 text-sm font-bold text-slate-600"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-50 text-slate-400"><Keyboard size={15} /></span>{commandLabels[command.name || ''] || command.description}</span><kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-500 shadow-[0_1px_0_white_inset]">{command.shortcut || 'Not assigned'}</kbd></div>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-lilac-100 bg-lilac-50/60 p-5"><h3 className="text-xs font-extrabold text-lilac-900">Dashboard shortcuts</h3><div className="mt-3 grid gap-2 sm:grid-cols-2"><p className="text-xs text-lilac-900/65"><kbd className="font-bold">Ctrl/Cmd + K</kbd> · Focus search</p><p className="text-xs text-lilac-900/65"><kbd className="font-bold">Ctrl/Cmd + Alt + N</kbd> · New note</p><p className="text-xs text-lilac-900/65"><kbd className="font-bold">F</kbd> · Favorite selected item</p><p className="text-xs text-lilac-900/65"><kbd className="font-bold">Enter / Esc</kbd> · Open or clear selection</p></div></div>
                  <button onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })} className="btn-secondary"><ExternalLink size={15} /> Customize browser shortcuts</button>
                </div>
              )}

              {section === 'privacy' && (
                <div className="space-y-6">
                  <div className="rounded-[24px] border border-lilac-100 bg-[linear-gradient(135deg,#faf7ff,#f0e7ff)] p-6"><div className="flex gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-lilac-700 shadow-sm"><ShieldCheck size={21} /></span><div><h3 className="text-sm font-extrabold text-lilac-950">Private by design</h3><p className="mt-2 text-xs leading-6 text-lilac-900/65">LilacSave reads the active page or selection only after an explicit save action. Smart tagging runs locally. OAuth tokens remain managed by Chrome Identity, saved content is never sent to an AI service, and Drive access remains limited to extension-created files.</p></div></div></div>
                  <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-100 p-4"><div className="text-xs font-extrabold text-slate-700">No passive tracking</div><p className="mt-2 text-xs leading-5 text-slate-400">Browsing history is not collected automatically.</p></div><div className="rounded-2xl border border-slate-100 p-4"><div className="text-xs font-extrabold text-slate-700">Offline first</div><p className="mt-2 text-xs leading-5 text-slate-400">Every save is written locally before cloud sync.</p></div><div className="rounded-2xl border border-slate-100 p-4"><div className="text-xs font-extrabold text-slate-700">Your Drive</div><p className="mt-2 text-xs leading-5 text-slate-400">Cloud copies stay inside your Google account.</p></div></div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-rose-600"><Trash2 size={17} /></span><div><h3 className="text-sm font-extrabold text-rose-950">Danger zone</h3><p className="mt-0.5 text-xs text-rose-800/55">These actions require confirmation and cannot always be undone.</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void clearLocal()} className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-xs font-extrabold text-rose-600 transition hover:bg-rose-50"><Trash2 size={14} className="mr-2 inline" /> Clear this device</button><button onClick={() => void deleteEverywhere()} className="rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-rose-700"><Trash2 size={14} className="mr-2 inline" /> Delete library everywhere</button></div></div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {status && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/80 bg-[#21192f] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_55px_rgba(33,25,47,.3)]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><Check size={15} /></span>
          <span className="min-w-0 flex-1">{status}</span>
          <button aria-label="Dismiss notification" onClick={() => setStatus('')} className="rounded-lg p-1 text-white/50 transition hover:bg-white/10 hover:text-white"><X size={15} /></button>
        </div>
      )}
    </main>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
)
