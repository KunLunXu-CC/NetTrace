import { useEffect, useMemo, useState } from 'react'
import { Card } from '@heroui/react'
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, CircleHelp, Home, Network, Play, Search, Settings, Square, Workflow, X } from 'lucide-react'
import type { CaptureRecord } from '../shared/app-info'

type NavItem = 'overview' | 'sessions' | 'settings'

const navItems: Array<{ id: NavItem; label: string; icon: typeof Home }> = [
  { id: 'overview', label: '概览', icon: Home },
  { id: 'sessions', label: '会话', icon: Workflow },
]

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('overview')
  const [appVersion, setAppVersion] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [command, setCommand] = useState('')
  const [captureBodies, setCaptureBodies] = useState(false)
  const [captureRunning, setCaptureRunning] = useState(false)
  const [capturePid, setCapturePid] = useState<number | undefined>()
  const [devtoolsPort, setDevtoolsPort] = useState<number | undefined>()
  const [activeCwd, setActiveCwd] = useState<string | undefined>()
  const [activeCommand, setActiveCommand] = useState<string | undefined>()
  const [records, setRecords] = useState<CaptureRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<CaptureRecord | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void window.netTrace.getInfo().then((info) => setAppVersion(info.version)).catch(() => undefined)
    return window.netTrace.onCaptureRecord((record) => {
      setRecords((items) => [...items.slice(-9999), record])
    })
  }, [])

  useEffect(() => {
    const updateStatus = (includeRecords: boolean) => void window.netTrace.getCaptureStatus(includeRecords).then((status) => {
      setCaptureRunning(status.running)
      setCapturePid(status.pid)
      setDevtoolsPort(status.devtoolsPort)
      setActiveCwd(status.cwd)
      setActiveCommand(status.command)
      if (status.running) {
        setProjectPath(status.cwd ?? '')
        setCommand(status.command ?? '')
        setCaptureBodies(status.captureBodies ?? false)
      }
      if (includeRecords) {
        setRecords((current) => {
          const recordsById = new Map(status.records.map((record) => [record.id, record]))
          for (const record of current) recordsById.set(record.id, record)
          return [...recordsById.values()]
            .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
            .slice(-10_000)
        })
      }
    }).catch(() => undefined)
    updateStatus(true)
    const timer = window.setInterval(() => updateStatus(false), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function toggleCapture() {
    setError('')
    if (captureRunning) {
      try {
        await window.netTrace.stopCapture()
        setCaptureRunning(false)
        setCapturePid(undefined)
        setDevtoolsPort(undefined)
      } catch (captureError) {
        setError(captureError instanceof Error ? captureError.message : String(captureError))
      }
      return
    }
    try {
      setRecords([])
      setSelectedRecord(null)
      const result = await window.netTrace.startCapture({ cwd: projectPath, command, captureBodies })
      setCaptureRunning(true)
      setCapturePid(result.pid)
      setDevtoolsPort(result.devtoolsPort)
      setActiveCwd(projectPath)
      setActiveCommand(command)
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : String(captureError))
    }
  }

  const visibleRecords = records.filter((record) => `${record.method} ${record.url}`.toLowerCase().includes(filter.toLowerCase()))
  const requestCount = records.filter((record) => !record.method.startsWith('WS ')).length
  const activeHosts = new Set(records.map((record) => { try { return new URL(record.url).host } catch { return record.url } })).size
  const activityBuckets = useMemo(() => {
    const now = Date.now()
    const bucketSize = 30_000
    const start = now - 20 * bucketSize
    const counts = Array<number>(20).fill(0)
    for (const record of records) {
      if (record.method.startsWith('WS ')) continue
      const index = Math.floor((Date.parse(record.timestamp) - start) / bucketSize)
      if (index >= 0 && index < counts.length) counts[index] += 1
    }
    return { counts, peak: Math.max(1, ...counts) }
  }, [records])

  return (
    <main className="flex h-full min-h-0 w-full bg-[var(--bg)]">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-[13px] pt-[23px] pb-3 max-[900px]:w-[205px] max-[900px]:shrink max-[640px]:w-[59px] max-[640px]:items-center max-[640px]:px-2">
        <div className="flex items-center gap-[10px] px-[9px] max-[640px]:px-0">
          <div className="flex size-[27px] items-center justify-center gap-[3px] rounded-lg border border-[#59b8a044] bg-[#59b8a01a]"><i className="h-2 w-[3px] rounded bg-[#59b8a099]" /><i className="h-[14px] w-[3px] rounded bg-[#59b8a0]" /><i className="h-[10px] w-[3px] rounded bg-[#59b8a0bf]" /></div>
          <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-[#edf0f5] max-[640px]:hidden">nettrace<span className="rounded border border-[var(--border)] px-[5px] py-[3px] text-[9px] font-medium tracking-normal text-[var(--muted)]">预览版</span></div>
        </div>

        <div className="mb-[10px] ml-[9px] mt-[39px] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--subtle)] max-[640px]:hidden">工作区</div>
        <nav className="grid gap-[3px] max-[640px]:mt-[35px] max-[640px]:w-full" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button className={`flex h-[37px] w-full items-center gap-[11px] rounded-[7px] px-[10px] text-left text-xs ${activeNav === item.id ? 'bg-[#59b8a01c] text-[#81d0b9]' : 'text-[var(--muted)] hover:bg-white/[.035] hover:text-[var(--text)]'} max-[640px]:justify-center max-[640px]:px-0`} key={item.id} type="button" onClick={() => setActiveNav(item.id)}><Icon size={17} /><span className="max-[640px]:hidden">{item.label}</span>{item.id === 'sessions' && <span className="ml-auto text-[10px] text-[var(--subtle)] max-[640px]:hidden">{records.length}</span>}</button>
          })}
        </nav>

        <div className="flex-1" />
        <div className="grid gap-3">
          <button className={`flex h-[37px] w-full items-center gap-[11px] rounded-[7px] px-[10px] text-left text-xs ${activeNav === 'settings' ? 'bg-[#59b8a01c] text-[#81d0b9]' : 'text-[var(--muted)] hover:bg-white/[.035]'} max-[640px]:hidden`} type="button" onClick={() => setActiveNav('settings')}><Settings size={16} />设置</button>
          <div className="flex min-w-0 items-center gap-[9px] border-t border-[var(--border)] px-[7px] pt-3 max-[640px]:justify-center max-[640px]:border-0 max-[640px]:px-0">
            <div className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#59b8a033] bg-[#59b8a017] text-[9px] font-bold text-[#82cdb8]">NT</div>
            <div className="grid min-w-0 flex-1 gap-[3px] max-[640px]:hidden"><strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-medium text-[#c6ccd5]">本地工作区</strong><span className="text-[9px] text-[var(--subtle)]">{appVersion ? `NetTrace ${appVersion}` : 'NetTrace'}</span></div>
            <span className="text-base tracking-widest text-[var(--subtle)] max-[640px]:hidden">···</span>
          </div>
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[55px] shrink-0 items-center justify-between border-b border-[var(--border)] bg-[#10141bb8] px-8 max-[900px]:px-[25px] max-[640px]:px-[15px]">
          <div className="flex items-center gap-[10px] text-[11px] text-[var(--muted)]"><span>NetTrace</span><span className="text-[#455061]">/</span><strong className="font-medium text-[#ccd2dc]">{activeNav === 'overview' ? '概览' : activeNav === 'sessions' ? '请求' : '设置'}</strong></div>
          <div className="flex items-center gap-[18px]"><span className="flex items-center gap-[7px] text-[10px] text-[var(--muted)] max-[640px]:text-0"><span className={`size-[6px] rounded-full ${captureRunning ? 'bg-[#50c99a] shadow-[0_0_0_3px_#50c99a1a]' : 'bg-[#718096] shadow-[0_0_0_3px_#7180961a]'}`} />{captureRunning ? `采集中 · PID ${capturePid ?? '…'}` : '采集器已就绪'}</span><button className="grid size-[22px] place-items-center rounded-full border border-[var(--border)] text-[var(--muted)]" type="button" aria-label="帮助"><CircleHelp size={13} /></button></div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1120px] px-10 pt-[37px] pb-[22px] max-[900px]:px-[25px] max-[640px]:px-[15px] max-[640px]:pt-[27px]">
            <section className="mb-[26px] flex items-end justify-between gap-5">
              <div><div className="mb-2 text-[9px] font-semibold tracking-[.13em] text-[#6aa995]">LOCAL NETWORK INSPECTOR</div><h1 className="m-0 text-[25px] font-medium tracking-tight text-[#edf0f5] max-[640px]:text-[22px]">{activeNav === 'overview' ? '流量概览' : activeNav === 'sessions' ? '请求记录' : '采集设置'}</h1><p className="mt-[7px] text-[11px] text-[var(--muted)]">通过 NetTrace CLI 启动任意项目并自动接入捕获。</p></div>
              <button className={`inline-flex h-[34px] items-center gap-2 rounded-[7px] border px-[13px] text-[10px] font-medium ${captureRunning ? 'border-[#ec696944] bg-[#ec69691a] text-[#ef9a9a]' : 'border-[#59b8a040] bg-[#59b8a01a] text-[#8bceb9]'}`} type="button" onClick={() => void toggleCapture()}>{captureRunning ? <><Square size={12} />停止进程</> : <><Play size={12} />启动命令</>}</button>
            </section>

            <Card className="!mb-[15px] !gap-3 !rounded-[9px] !border !border-[var(--border)] !bg-[#161c25d1] !p-4">
              <div className="grid grid-cols-[minmax(180px,1fr)_minmax(240px,2fr)] gap-3 max-[640px]:grid-cols-1">
                <label className="grid gap-1.5 text-[10px] text-[var(--muted)]">项目目录<input className="h-8 min-w-0 rounded-md border border-[var(--border)] bg-[#10141b] px-2.5 text-[11px] text-[var(--text)] outline-none focus:border-[#59b8a077]" placeholder="例如 /Users/me/project" value={projectPath} onChange={(event) => setProjectPath(event.target.value)} disabled={captureRunning} /></label>
                <label className="grid gap-1.5 text-[10px] text-[var(--muted)]">启动命令<input className="h-8 min-w-0 rounded-md border border-[var(--border)] bg-[#10141b] px-2.5 font-mono text-[11px] text-[var(--text)] outline-none focus:border-[#59b8a077]" placeholder="例如 pnpm dev" value={command} onChange={(event) => setCommand(event.target.value)} disabled={captureRunning} /></label>
              </div>
              <p className="m-0 text-[9px] text-[var(--subtle)]">在任意项目目录也可运行：<code className="text-[#8fd0b9]">nettrace run -- pnpm dev</code></p>
              <label className="flex items-center gap-2 text-[10px] text-[var(--muted)]"><input type="checkbox" checked={captureBodies} onChange={(event) => setCaptureBodies(event.target.checked)} disabled={captureRunning} />采集请求与响应正文 <span className="text-[var(--subtle)]">（默认关闭，常见凭证已脱敏，单条 128 KB；二进制响应不展开）</span></label>
              {error && <p className="m-0 text-[10px] text-[#ef8989]">{error}</p>}
              {captureRunning && <p className="m-0 truncate text-[9px] text-[var(--subtle)]" title={`${activeCwd ?? ''} · ${activeCommand ?? ''}`}>运行中：{activeCwd} · <code>{activeCommand}</code> · CDP {devtoolsPort ?? '等待应用接入'}</p>}
            </Card>

            <section className="mb-[15px] grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[640px]:gap-2" aria-label="流量统计">
              {[{ label: 'HTTP 请求', value: requestCount, icon: ArrowUpRight, note: captureRunning ? '当前会话' : '启动项目后采集' }, { label: '目标主机', value: activeHosts, icon: Network, note: '去重主机数' }, { label: 'WebSocket 帧', value: records.filter((record) => record.method.startsWith('WS ')).length, icon: ArrowDown, note: '通过 Chromium CDP' }, { label: '正文采集', value: captureBodies ? '开启' : '关闭', icon: ArrowUp, note: '敏感字段自动脱敏' }].map(({ label, value, icon: Icon, note }) => <Card key={label} className="!gap-0 !rounded-[9px] !border !border-[var(--border)] !bg-[linear-gradient(145deg,#19202aee,#151b24e6)] !p-[15px_16px_12px] max-[640px]:!min-h-[104px] max-[640px]:!p-3"><div className="flex items-center justify-between text-[10px] text-[var(--muted)] max-[640px]:text-[9px]"><span>{label}</span><span className="grid size-[23px] place-items-center rounded-md border border-[var(--border)] text-[#8391a2]"><Icon size={13} /></span></div><div className="mt-[7px] font-mono text-[22px] font-normal tracking-tight text-[#d8dde5]">{value}</div><div className="mt-1 text-[9px] text-[var(--subtle)]">{note}</div></Card>)}
            </section>

            <Card className="!mb-[15px] !gap-0 !overflow-hidden !rounded-[9px] !border !border-[var(--border)] !bg-[#161c25d1]">
              <div className="flex min-h-[62px] items-center justify-between gap-5 px-4 py-[13px]"><div><h2 className="m-0 text-[11px] font-medium text-[#dce1e8]">流量活动</h2><p className="mt-[5px] text-[9px] text-[var(--subtle)]">捕获开始后，这里会显示最近 10 分钟的请求量</p></div><span className="rounded-[5px] border border-[var(--border)] bg-white/[.02] px-2 py-[6px] text-[9px] text-[var(--muted)]">每 30 秒</span></div>
              <div className="relative mx-4 mb-[13px] h-[190px] border-t border-white/[.05]"><div className="absolute inset-x-0 inset-y-3 flex flex-col justify-between"><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /></div><div className="absolute inset-x-0 inset-y-3 flex items-end gap-1 px-1">{activityBuckets.counts.map((count, index) => <div className="flex h-full min-w-0 flex-1 items-end" key={index} title={`${count} 个请求`}><i className="w-full rounded-t-[2px] bg-[#59b8a0] transition-[height]" style={{ height: `${count ? Math.max(5, count / activityBuckets.peak * 100) : 2}%`, opacity: count ? 0.9 : 0.16 }} /></div>)}</div><div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[8px] text-[#566273]"><span>10 分钟前</span><span>5 分钟前</span><span>现在</span></div></div>
            </Card>

            <Card className="!gap-0 !overflow-hidden !rounded-[9px] !border !border-[var(--border)] !bg-[#161c25d1]">
              <div className="flex min-h-[62px] items-center justify-between gap-5 px-4 py-[13px]"><div><h2 className="m-0 text-[11px] font-medium text-[#dce1e8]">最近请求</h2><p className="mt-[5px] text-[9px] text-[var(--subtle)]">Node 主进程 HTTP、Chromium 请求与 WebSocket</p></div><div className="flex items-center gap-3"><label className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] px-2 text-[var(--muted)]"><Search size={12} /><input className="w-36 bg-transparent text-[10px] outline-none placeholder:text-[var(--subtle)]" placeholder="筛选 URL 或方法" value={filter} onChange={(event) => setFilter(event.target.value)} /></label><button className="inline-flex items-center gap-1 border-0 bg-transparent text-[9px] text-[#7bb9a8]" type="button" onClick={() => setActiveNav('sessions')}>全部 <ArrowRight size={12} /></button></div></div>
              <div><div className="grid h-[30px] grid-cols-[70px_70px_minmax(180px,1fr)_70px_80px] items-center border-y border-white/[.07] px-4 text-[9px] text-[#707d8f]"><span>来源</span><span>方法</span><span>URL</span><span>状态</span><span>耗时</span></div>
                {visibleRecords.length ? <div className="max-h-[260px] overflow-auto">{visibleRecords.slice(-100).reverse().map((record) => <button className="grid min-h-[34px] w-full grid-cols-[70px_70px_minmax(180px,1fr)_70px_80px] items-center border-b border-white/[.04] px-4 text-left text-[9px] hover:bg-white/[.03]" type="button" key={record.id} onClick={() => setSelectedRecord(record)}><span className="text-[var(--muted)]">{record.source === 'chromium' ? 'Chromium' : 'Node'}</span><span className="font-mono text-[#8bbfae]">{record.method}</span><span className="truncate pr-3 text-[#b8c0cc]">{record.url}</span><span className={record.error ? 'text-[#ed8585]' : 'text-[var(--muted)]'}>{record.status ?? (record.error ? 'ERR' : '…')}</span><span className="font-mono text-[var(--subtle)]">{record.durationMs} ms</span></button>)}</div> : <div className="flex h-[83px] flex-col items-center justify-center gap-[7px] text-[9px] text-[var(--subtle)]"><Network size={17} className="text-[#5c697a]" /><span>{captureRunning ? '等待捕获请求…' : '启动项目后请求会显示在这里'}</span></div>}
              </div>
            </Card>

            {selectedRecord && <div className="fixed inset-0 z-20 flex justify-end bg-black/45" onClick={() => setSelectedRecord(null)}><aside className="flex h-full w-[min(620px,90vw)] flex-col border-l border-[var(--border)] bg-[#131820] shadow-2xl" onClick={(event) => event.stopPropagation()}><header className="flex h-14 items-center justify-between border-b border-[var(--border)] px-5"><div><strong className="text-xs">请求详情</strong><span className="ml-2 text-[10px] text-[var(--muted)]">{selectedRecord.source === 'chromium' ? 'Chromium' : `Node ${selectedRecord.processId}`}</span></div><button className="grid size-7 place-items-center rounded-md text-[var(--muted)] hover:bg-white/5" type="button" onClick={() => setSelectedRecord(null)}><X size={15} /></button></header><div className="grid gap-4 overflow-auto p-5 text-[10px]"><div><div className="mb-1 text-[var(--subtle)]">{selectedRecord.method} · {selectedRecord.status ?? 'ERR'}</div><code className="break-all text-[#8fd0b9]">{selectedRecord.url}</code></div><DetailBlock title="请求头" value={selectedRecord.requestHeaders} /><DetailBlock title={selectedRecord.method.startsWith('WS ') ? '帧内容' : '请求正文'} value={selectedRecord.requestBody} /><DetailBlock title="响应头" value={selectedRecord.responseHeaders} /><DetailBlock title="响应正文" value={selectedRecord.responseBody} />{selectedRecord.error && <DetailBlock title="错误" value={selectedRecord.error} />}</div></aside></div>}

            <footer className="flex items-center justify-between px-0.5 pt-[17px] text-[9px] text-[#647183]"><span className="inline-flex items-center gap-[7px]"><i className="size-[5px] rounded-full bg-[#58a98e]" />本地运行</span><span>Node 主进程 · Chromium · WebSocket</span></footer>
          </div>
        </div>
      </section>
    </main>
  )
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  return <section><h3 className="mb-1.5 text-[10px] font-medium text-[var(--muted)]">{title}</h3><pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--border)] bg-[#0f1319] p-3 font-mono text-[9px] leading-relaxed text-[#c3ccd8]">{value === undefined || value === null ? '未记录' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></section>
}
