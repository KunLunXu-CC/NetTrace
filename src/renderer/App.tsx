import { useEffect, useState } from 'react'
import { Card } from '@heroui/react'
import { Activity, ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, CircleHelp, Home, Network, Radio, Settings, Workflow } from 'lucide-react'

type NavItem = 'overview' | 'sessions' | 'settings'

const navItems: Array<{ id: NavItem; label: string; icon: typeof Home }> = [
  { id: 'overview', label: '概览', icon: Home },
  { id: 'sessions', label: '会话', icon: Workflow },
]

export function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('overview')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    void window.netTrace.getInfo().then((info) => setAppVersion(info.version)).catch(() => undefined)
  }, [])

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
            return <button className={`flex h-[37px] w-full items-center gap-[11px] rounded-[7px] px-[10px] text-left text-xs ${activeNav === item.id ? 'bg-[#59b8a01c] text-[#81d0b9]' : 'text-[var(--muted)] hover:bg-white/[.035] hover:text-[var(--text)]'} max-[640px]:justify-center max-[640px]:px-0`} key={item.id} type="button" onClick={() => setActiveNav(item.id)}><Icon size={17} /><span className="max-[640px]:hidden">{item.label}</span>{item.id === 'sessions' && <span className="ml-auto text-[10px] text-[var(--subtle)] max-[640px]:hidden">0</span>}</button>
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
          <div className="flex items-center gap-[10px] text-[11px] text-[var(--muted)]"><span>工作区</span><span className="text-[#455061]">/</span><strong className="font-medium text-[#ccd2dc]">{activeNav === 'overview' ? '概览' : activeNav === 'sessions' ? '会话' : '设置'}</strong></div>
          <div className="flex items-center gap-[18px]"><span className="flex items-center gap-[7px] text-[10px] text-[var(--muted)] max-[640px]:text-0"><span className="size-[6px] rounded-full bg-[#718096] shadow-[0_0_0_3px_#7180961a]" />捕获引擎未连接</span><button className="grid size-[22px] place-items-center rounded-full border border-[var(--border)] text-[var(--muted)]" type="button" aria-label="帮助"><CircleHelp size={13} /></button></div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1120px] px-10 pt-[37px] pb-[22px] max-[900px]:px-[25px] max-[640px]:px-[15px] max-[640px]:pt-[27px]">
            <section className="mb-[26px] flex items-end justify-between gap-5">
              <div><div className="mb-2 text-[9px] font-semibold tracking-[.13em] text-[#6aa995]">NETWORK OBSERVABILITY</div><h1 className="m-0 text-[25px] font-medium tracking-tight text-[#edf0f5] max-[640px]:text-[22px]">{activeNav === 'overview' ? '流量概览' : activeNav === 'sessions' ? '网络会话' : '设置'}</h1><p className="mt-[7px] text-[11px] text-[var(--muted)]">捕获并检查设备上的网络活动。</p></div>
              <button className="inline-flex h-[34px] items-center gap-2 rounded-[7px] border border-[#59b8a040] bg-[#59b8a01a] px-[13px] text-[10px] font-medium text-[#8bceb9] opacity-70" type="button" disabled title="捕获引擎尚未接入"><Radio size={13} />开始捕获</button>
            </section>

            <section className="mb-[15px] grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[640px]:gap-2" aria-label="流量统计">
              {[{ label: '请求总数', icon: ArrowUpRight, note: '等待捕获数据' }, { label: '活动连接', icon: Network, note: '等待捕获数据' }, { label: '已接收', icon: ArrowDown, note: '总接收流量' }, { label: '已发送', icon: ArrowUp, note: '总发送流量' }].map(({ label, icon: Icon, note }) => <Card key={label} className="!gap-0 !rounded-[9px] !border !border-[var(--border)] !bg-[linear-gradient(145deg,#19202aee,#151b24e6)] !p-[15px_16px_12px] max-[640px]:!min-h-[104px] max-[640px]:!p-3"><div className="flex items-center justify-between text-[10px] text-[var(--muted)] max-[640px]:text-[9px]"><span>{label}</span><span className="grid size-[23px] place-items-center rounded-md border border-[var(--border)] text-[#8391a2]"><Icon size={13} /></span></div><div className="mt-[7px] font-mono text-[22px] font-normal tracking-tight text-[#d8dde5]">—</div><div className="mt-1 text-[9px] text-[var(--subtle)]">{note}</div></Card>)}
            </section>

            <Card className="!mb-[15px] !gap-0 !overflow-hidden !rounded-[9px] !border !border-[var(--border)] !bg-[#161c25d1]">
              <div className="flex min-h-[62px] items-center justify-between gap-5 px-4 py-[13px]"><div><h2 className="m-0 text-[11px] font-medium text-[#dce1e8]">流量活动</h2><p className="mt-[5px] text-[9px] text-[var(--subtle)]">捕获开始后，这里会显示实时网络活动</p></div><button className="flex items-center gap-2 rounded-[5px] border border-[var(--border)] bg-white/[.02] px-2 py-[6px] text-[9px] text-[var(--muted)]" type="button" disabled>实时 <ArrowRight size={11} className="rotate-90 text-[var(--subtle)]" /></button></div>
              <div className="relative mx-4 mb-[13px] h-[190px] border-t border-white/[.05]"><div className="absolute inset-x-0 inset-y-3 flex flex-col justify-between"><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /><i className="border-t border-dashed border-white/[.07]" /></div><div className="absolute inset-0 bottom-4 flex flex-col items-center justify-center gap-[7px]"><div className="mb-0.5 grid size-[34px] place-items-center rounded-[10px] border border-[#59b8a024] bg-[#59b8a00c] text-[#5da58f]"><Activity size={16} /></div><strong className="text-[10px] font-medium text-[#aeb7c4]">尚无流量数据</strong><span className="text-[9px] text-[var(--subtle)]">连接捕获引擎后，流量趋势将在此显示</span></div><div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[8px] text-[#566273]"><span>—</span><span>—</span><span>—</span><span>—</span><span>现在</span></div></div>
            </Card>

            <Card className="!gap-0 !overflow-hidden !rounded-[9px] !border !border-[var(--border)] !bg-[#161c25d1]">
              <div className="flex min-h-[62px] items-center justify-between gap-5 px-4 py-[13px]"><div><h2 className="m-0 text-[11px] font-medium text-[#dce1e8]">最近请求</h2><p className="mt-[5px] text-[9px] text-[var(--subtle)]">捕获到的 HTTP 与 HTTPS 请求</p></div><button className="inline-flex items-center gap-1 border-0 bg-transparent text-[9px] text-[#7bb9a8]" type="button" onClick={() => setActiveNav('sessions')}>查看会话 <ArrowRight size={12} /></button></div>
              <div><div className="grid h-[30px] grid-cols-[90px_minmax(140px,1.1fr)_minmax(150px,1.5fr)_90px_70px] items-center border-y border-white/[.07] px-4 text-[9px] text-[#707d8f] max-[640px]:grid-cols-[55px_minmax(90px,1fr)_minmax(100px,1fr)_50px]"><span>方法</span><span>主机</span><span>路径</span><span>状态</span><span className="max-[640px]:hidden">耗时</span></div><div className="flex h-[83px] flex-col items-center justify-center gap-[7px] text-[9px] text-[var(--subtle)]"><Network size={17} className="text-[#5c697a]" /><span>还没有捕获到请求</span></div></div>
            </Card>

            <footer className="flex items-center justify-between px-0.5 pt-[17px] text-[9px] text-[#647183]"><span className="inline-flex items-center gap-[7px]"><i className="size-[5px] rounded-full bg-[#58a98e]" />本地运行</span><span>捕获功能正在开发中</span></footer>
          </div>
        </div>
      </section>
    </main>
  )
}
