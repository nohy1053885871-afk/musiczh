import { UAParser } from 'ua-parser-js'

export function parseUA(ua: string | null): { browser: string; os: string; device_type: string } {
  if (!ua) return { browser: '其他', os: '其他', device_type: '其他' }
  const res = new UAParser(ua).getResult()
  let browser = res.browser.name ?? '其他'
  if (/MicroMessenger/i.test(ua)) browser = '微信内置'
  if (browser === 'Mobile Safari') browser = 'Safari'
  const os = res.os.name ?? '其他'
  const t = res.device.type
  const device_type = t === 'mobile' ? '手机' : t === 'tablet' ? '平板' : '桌面'
  return { browser, os, device_type }
}
