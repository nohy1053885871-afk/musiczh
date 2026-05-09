import { Button } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { toCSV, downloadCSV, type CSVColumn } from '../../lib/csv'

export function DownloadCSVButton<T>({
  filename,
  columns,
  dataSource,
  size = 'small',
  disabled,
}: {
  filename: string
  columns: CSVColumn<T>[]
  dataSource: T[]
  size?: 'small' | 'middle' | 'large'
  disabled?: boolean
}) {
  return (
    <Button
      icon={<DownloadOutlined />}
      size={size}
      disabled={disabled || dataSource.length === 0}
      onClick={() => downloadCSV(filename, toCSV(columns, dataSource))}
    >
      下载 CSV
    </Button>
  )
}
