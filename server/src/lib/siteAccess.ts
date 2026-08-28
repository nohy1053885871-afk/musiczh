import type Database from 'better-sqlite3'
import { isIP } from 'node:net'
import db from '../db.js'

export const SITE_ACCESS_RESTRICTED_KEY = 'site_access_restricted'
export const SITE_ACCESS_RESTRICTED_MESSAGE_KEY = 'site_access_restricted_message'

export type SiteAccessRuleKind = 'allow' | 'deny'

export type SiteAccessRule = {
  id: number
  address: string
  rule: SiteAccessRuleKind
  note: string | null
  createdAt: number
  updatedAt: number
}

export type SiteAccessSnapshot = {
  enabled: boolean
  currentIp: string | null
  updatedAt: number | null
  allowedIps: SiteAccessRule[]
  blockedIps: SiteAccessRule[]
  restrictedPage: RestrictedPageConfig
}

export type RestrictedPageConfig = {
  message: string | null
  updatedAt: number | null
}

export type RulePatch = {
  rule?: SiteAccessRuleKind
  note?: string | null
  confirmCurrentIp?: boolean
}

export class SiteAccessError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

type RuleRow = {
  id: number
  address: string
  rule: SiteAccessRuleKind
  note: string | null
  created_at: number
  updated_at: number
}

function rowToRule(row: RuleRow): SiteAccessRule {
  return {
    id: row.id,
    address: row.address,
    rule: row.rule,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function normalizeIpAddress(input: string): string {
  const address = input.trim()
  const version = isIP(address)
  if (version === 4) return address
  if (version !== 6) throw new SiteAccessError('invalid_ip')

  try {
    const hostname = new URL(`http://[${address}]/`).hostname
    return hostname.slice(1, -1).toLowerCase()
  } catch {
    throw new SiteAccessError('invalid_ip')
  }
}

export function normalizeOptionalNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const normalized = note.trim()
  return normalized.length > 0 ? normalized : null
}

export function normalizeRestrictedMessage(message: string | null | undefined): string | null {
  if (message === null || message === undefined) return null
  const normalized = message.trim()
  if (normalized.length > 200) throw new SiteAccessError('invalid_restricted_message')
  return normalized.length > 0 ? normalized : null
}

export function isLoopbackIp(address: string): boolean {
  return address === '127.0.0.1' || address === '::1'
}

export type SiteAccessStore = ReturnType<typeof createSiteAccessStore>

export function createSiteAccessStore(database: Database.Database) {
  const getRuleByAddress = (address: string): SiteAccessRule | null => {
    const row = database
      .prepare(
        `SELECT id, address, rule, note, created_at, updated_at
         FROM site_access_ip_rules WHERE address = ?`,
      )
      .get(address) as RuleRow | undefined
    return row ? rowToRule(row) : null
  }

  const getRuleById = (id: number): SiteAccessRule | null => {
    const row = database
      .prepare(
        `SELECT id, address, rule, note, created_at, updated_at
         FROM site_access_ip_rules WHERE id = ?`,
      )
      .get(id) as RuleRow | undefined
    return row ? rowToRule(row) : null
  }

  const getMode = () => {
    const row = database
      .prepare('SELECT value, updated_at FROM feature_flags WHERE key = ?')
      .get(SITE_ACCESS_RESTRICTED_KEY) as
      | { value: string; updated_at: number }
      | undefined
    return {
      enabled: row?.value === 'true',
      updatedAt: row?.updated_at ?? null,
    }
  }

  const getRestrictedPageConfig = (): RestrictedPageConfig => {
    const row = database
      .prepare(
        `SELECT value, updated_at FROM feature_flags
         WHERE key = ?`,
      )
      .get(SITE_ACCESS_RESTRICTED_MESSAGE_KEY) as
      { value: string; updated_at: number } | undefined
    let message: string | null = null
    try { message = normalizeRestrictedMessage(row?.value) } catch { /* invalid DB value stays hidden */ }
    return {
      message,
      updatedAt: row?.updated_at ?? null,
    }
  }

  const snapshot = (currentIp: string | null): SiteAccessSnapshot => {
    const rows = database
      .prepare(
        `SELECT id, address, rule, note, created_at, updated_at
         FROM site_access_ip_rules
         ORDER BY created_at ASC, id ASC`,
      )
      .all() as RuleRow[]
    const rules = rows.map(rowToRule)
    const mode = getMode()
    const latestRuleUpdate = rules.reduce<number | null>(
      (latest, rule) => latest === null ? rule.updatedAt : Math.max(latest, rule.updatedAt),
      null,
    )
    return {
      ...mode,
      updatedAt: mode.updatedAt === null
        ? latestRuleUpdate
        : latestRuleUpdate === null
          ? mode.updatedAt
          : Math.max(mode.updatedAt, latestRuleUpdate),
      currentIp,
      allowedIps: rules.filter((rule) => rule.rule === 'allow'),
      blockedIps: rules.filter((rule) => rule.rule === 'deny'),
      restrictedPage: getRestrictedPageConfig(),
    }
  }

  const ensureCurrentIp = (currentIp: string | null): SiteAccessSnapshot => {
    if (!currentIp) throw new SiteAccessError('current_ip_unavailable')
    if (!getRuleByAddress(currentIp) && !isLoopbackIp(currentIp)) {
      const now = Date.now()
      database
        .prepare(
          `INSERT INTO site_access_ip_rules
             (address, rule, note, created_at, updated_at)
           VALUES (?, 'allow', NULL, ?, ?)`,
        )
        .run(currentIp, now, now)
    }
    return snapshot(currentIp)
  }

  const createRule = (
    addressInput: string,
    rule: SiteAccessRuleKind,
    note: string | null,
    currentIp: string | null,
  ): SiteAccessSnapshot => {
    const address = normalizeIpAddress(addressInput)
    if (isLoopbackIp(address)) throw new SiteAccessError('reserved_ip')
    if (getRuleByAddress(address)) throw new SiteAccessError('duplicate_ip')
    if (address === currentIp && rule === 'deny') {
      throw new SiteAccessError('current_ip_confirmation_required')
    }
    const now = Date.now()
    database
      .prepare(
        `INSERT INTO site_access_ip_rules
           (address, rule, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(address, rule, normalizeOptionalNote(note), now, now)
    return snapshot(currentIp)
  }

  const updateRule = (
    id: number,
    patch: RulePatch,
    currentIp: string | null,
  ): SiteAccessSnapshot => {
    const existing = getRuleById(id)
    if (!existing) throw new SiteAccessError('rule_not_found')
    const nextRule = patch.rule ?? existing.rule
    if (
      existing.address === currentIp &&
      existing.rule === 'allow' &&
      nextRule === 'deny' &&
      !patch.confirmCurrentIp
    ) {
      throw new SiteAccessError('current_ip_confirmation_required')
    }
    const nextNote =
      patch.note === undefined
        ? existing.note
        : normalizeOptionalNote(patch.note)
    database
      .prepare(
        `UPDATE site_access_ip_rules
         SET rule = ?, note = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(nextRule, nextNote, Date.now(), id)
    return snapshot(currentIp)
  }

  const deleteRule = (id: number, currentIp: string | null): SiteAccessSnapshot => {
    const existing = getRuleById(id)
    if (!existing) throw new SiteAccessError('rule_not_found')
    if (existing.address === currentIp) {
      throw new SiteAccessError('current_ip_protected')
    }
    database.prepare('DELETE FROM site_access_ip_rules WHERE id = ?').run(id)
    return snapshot(currentIp)
  }

  const setMode = (enabled: boolean, currentIp: string | null): SiteAccessSnapshot => {
    if (enabled) {
      if (!currentIp) throw new SiteAccessError('current_ip_unavailable')
      const currentRule = getRuleByAddress(currentIp)
      if (currentRule?.rule !== 'allow') {
        throw new SiteAccessError('current_ip_not_allowed')
      }
    }
    const updatedAt = Date.now()
    database
      .prepare(
        `INSERT INTO feature_flags (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(SITE_ACCESS_RESTRICTED_KEY, enabled ? 'true' : 'false', updatedAt)
    return snapshot(currentIp)
  }

  const saveRestrictedPage = database.prepare(
    `INSERT INTO feature_flags (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  )

  const setRestrictedPageConfig = (
    messageInput: string | null,
    currentIp: string | null,
  ): SiteAccessSnapshot => {
    const message = normalizeRestrictedMessage(messageInput)
    saveRestrictedPage.run(SITE_ACCESS_RESTRICTED_MESSAGE_KEY, message ?? '', Date.now())
    return snapshot(currentIp)
  }

  const isAllowed = (addressInput: string | null): boolean => {
    if (!addressInput) return false
    const address = normalizeIpAddress(addressInput)
    if (isLoopbackIp(address)) return true
    const rule = getRuleByAddress(address)
    if (rule?.rule === 'deny') return false
    if (!getMode().enabled) return true
    return rule?.rule === 'allow'
  }

  return {
    snapshot,
    ensureCurrentIp,
    createRule,
    updateRule,
    deleteRule,
    setMode,
    isAllowed,
    getRestrictedPageConfig,
    setRestrictedPageConfig,
  }
}

export const siteAccessStore = createSiteAccessStore(db)
