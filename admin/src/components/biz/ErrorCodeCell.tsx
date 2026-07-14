import { ERROR_CODE_LABEL } from '../../lib/format'

/**
 * 错误码单元格：有中文映射时主显中文、副显原文 code（排查时复制用）；
 * 无映射（如 download 阶段的 ZIP_FAILED 或未来新码）自动回退原文，永不空白。
 * 失败日志 / 下载日志的表格列与详情抽屉共用。
 */
export function ErrorCodeCell({ code }: { code: string | null | undefined }) {
  if (!code) return <>-</>
  const zh = ERROR_CODE_LABEL[code]
  if (!zh) return <code style={{ fontSize: 12 }}>{code}</code>
  return (
    <div style={{ lineHeight: 1.4 }}>
      <div>{zh}</div>
      <code style={{ fontSize: 11, color: '#8c8c8c' }}>{code}</code>
    </div>
  )
}
