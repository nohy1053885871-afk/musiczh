import { useEffect, useState } from 'react'
import { analytics } from './analytics'

// 给元素绑定曝光埋点：元素挂载且进入视口 >=50%、停留 >=300ms 时触发一次 *_view
// callback ref：旧版用 useRef + useEffect([event])，但 FileRow 内按钮随 status 切换才挂载，
// effect 首跑时 ref.current 还是 null，且 deps 不含 ref，observer 永远绑不上。
// 改用 callback ref + useState 触发 effect 重跑：node 从 null 变成 DOM 元素时重绑。
export function useImpression<T extends HTMLElement>(
  event: string,
  props?: Record<string, unknown>,
) {
  const [node, setNode] = useState<T | null>(null)
  useEffect(() => {
    if (!node) return
    return analytics.observeImpression(node, event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, event])
  return setNode
}
