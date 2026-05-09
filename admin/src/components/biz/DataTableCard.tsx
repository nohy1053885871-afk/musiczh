import { Card, Table } from 'antd'
import type { TableProps } from 'antd'
import type { ReactNode } from 'react'

type Props<T> = {
  title?: ReactNode
  toolbar?: ReactNode
  columns: TableProps<T>['columns']
  dataSource: T[]
  rowKey: TableProps<T>['rowKey']
  loading?: boolean
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onRow?: TableProps<T>['onRow']
  scroll?: TableProps<T>['scroll']
  size?: 'small' | 'middle' | 'large'
}

export function DataTableCard<T extends object>({
  title,
  toolbar,
  columns,
  dataSource,
  rowKey,
  loading,
  total,
  page = 1,
  pageSize = 10,
  onPageChange,
  onRow,
  scroll,
  size = 'middle',
}: Props<T>) {
  const usePagination = total != null && onPageChange
  return (
    <Card
      title={title}
      extra={toolbar}
      styles={{ body: { padding: 0 } }}
    >
      <Table<T>
        columns={columns}
        dataSource={dataSource}
        rowKey={rowKey}
        loading={loading}
        size={size}
        scroll={scroll}
        onRow={onRow}
        pagination={
          usePagination
            ? {
                current: page,
                pageSize,
                total,
                showQuickJumper: true,
                showSizeChanger: false,
                showTotal: (n) => `共 ${n} 条`,
                onChange: (p) => onPageChange(p),
              }
            : false
        }
      />
    </Card>
  )
}
