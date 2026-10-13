const ICP_FILING_URL = 'https://beian.miit.gov.cn/'
const ICP_FILING_NUMBER = '浙ICP备2026021939号-2'

export function IcpFilingLink() {
  return (
    <a
      href={ICP_FILING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex rounded font-normal text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B20]/35"
    >
      {ICP_FILING_NUMBER}
    </a>
  )
}
