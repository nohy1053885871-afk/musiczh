// CSV 导出工具：UTF-8 BOM + 字段转义；Excel 双击打开中文不乱码

export type CSVColumn<T> = {
  key: string
  title: string
  format?: (row: T) => string | number | null | undefined
}

function escapeField(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCSV<T>(columns: CSVColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeField(c.title)).join(',')
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const v = c.format
            ? c.format(row)
            : (row as unknown as Record<string, unknown>)[c.key]
          return escapeField(v)
        })
        .join(','),
    )
    .join('\n')
  return `${header}\n${body}`
}

export function downloadCSV(filename: string, content: string): void {
  const BOM = '﻿'
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
