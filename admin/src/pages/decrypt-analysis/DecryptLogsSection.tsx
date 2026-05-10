import { useState } from 'react'
import { Segmented, Space } from 'antd'
import { FailuresSubSection } from './FailuresSubSection'
import { SuccessesSubSection } from './SuccessesSubSection'

export function DecryptLogsSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [tab, setTab] = useState<'fail' | 'done'>('fail')

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Segmented
        value={tab}
        onChange={(v) => setTab(v as 'fail' | 'done')}
        options={[
          { value: 'fail', label: '失败' },
          { value: 'done', label: '成功' },
        ]}
      />
      {tab === 'fail'
        ? <FailuresSubSection rq={rq} reloadKey={reloadKey} />
        : <SuccessesSubSection rq={rq} reloadKey={reloadKey} />}
    </Space>
  )
}
