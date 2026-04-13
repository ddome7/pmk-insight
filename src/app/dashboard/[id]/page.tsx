'use client'

import { use, useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { ko } from 'date-fns/locale'

interface Advertiser {
  id: string
  manager_name: string
  advertiser_name: string
  sheet_url: string
  folder_id: string | null
  created_at: string
}

interface ColumnInterpretation {
  column: string
  type: string
  description: string
}

interface InsightItem {
  title: string
  description: string
}

interface NextStepItem {
  type: string
  action: string
}

interface InsightResult {
  insights: InsightItem[]
  nextSteps: NextStepItem[]
  report: string
}

interface HistoryEntry {
  id: string
  analysis_start: string
  analysis_end: string
  compare_start: string | null
  compare_end: string | null
  result: InsightResult
  created_at: string
}

export default function AdvertiserInsightPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sheetData, setSheetData] = useState<string[][] | null>(null)
  const [sheetError, setSheetError] = useState('')
  const [fetchingSheet, setFetchingSheet] = useState(false)
  const [columnInterpretation, setColumnInterpretation] = useState<ColumnInterpretation[] | null>(null)
  const [interpretingColumns, setInterpretingColumns] = useState(false)
  const [insightResult, setInsightResult] = useState<InsightResult | null>(null)
  const [generatingInsight, setGeneratingInsight] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [step, setStep] = useState<'idle' | 'fetching' | 'interpreting' | 'generating' | 'done'>('idle')
  const [insightHistory, setInsightHistory] = useState<HistoryEntry[]>([])
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  // 패널 크기 조절
  const [rightPanelPct, setRightPanelPct] = useState(20)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newRightPct = Math.max(15, Math.min(50, (1 - (e.clientX - rect.left) / rect.width) * 100))
      setRightPanelPct(newRightPct)
    }
    const onMouseUp = () => { isDragging.current = false }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const toDateStr = (d: Date) => d.toISOString().split('T')[0]
  const [analysisStart, setAnalysisStart] = useState<Date>(new Date(Date.now() - 86400000))
  const [analysisEnd, setAnalysisEnd] = useState<Date>(new Date(Date.now() - 86400000))
  const [compareStart, setCompareStart] = useState<Date>(new Date(Date.now() - 86400000 * 2))
  const [compareEnd, setCompareEnd] = useState<Date>(new Date(Date.now() - 86400000 * 2))
  const [weekendIncluded, setWeekendIncluded] = useState(false)

  // 기준 기간 종료일이 월요일이면, 비교 기간을 전주 금요일로 자동 설정
  const handleAnalysisEndChange = (date: Date | null) => {
    if (!date) return
    setAnalysisEnd(date)
    if (date > analysisStart) setAnalysisStart(date)

    const dayOfWeek = date.getDay() // 0=일,1=월,...,6=토
    if (dayOfWeek === 1) {
      const friday = new Date(date.getTime() - 3 * 86400000)
      friday.setHours(0, 0, 0, 0)
      setCompareStart(friday)
      setCompareEnd(friday)
      setWeekendIncluded(false)
    }
  }

  const handleWeekendToggle = () => {
    const nextIncluded = !weekendIncluded
    setWeekendIncluded(nextIncluded)
    if (nextIncluded) {
      // 금요일 기준으로 일요일까지 확장
      const friday = compareEnd.getDay() === 5 ? compareEnd
        : compareStart.getDay() === 5 ? compareStart : compareEnd
      const sunday = new Date(friday.getTime() + 2 * 86400000)
      sunday.setHours(0, 0, 0, 0)
      setCompareEnd(sunday)
    } else {
      // 일요일에서 금요일로 되돌리기
      const friday = new Date(compareEnd.getTime() - 2 * 86400000)
      friday.setHours(0, 0, 0, 0)
      setCompareEnd(friday)
    }
  }

  useEffect(() => {
    loadAdvertiser()
    loadHistory()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadHistory = async () => {
    const { data } = await supabase
      .from('insight_history')
      .select('*')
      .eq('advertiser_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) setInsightHistory(data as HistoryEntry[])
  }

  const loadAdvertiser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error } = await supabase
      .from('advertisers')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      router.push('/dashboard')
      return
    }
    setAdvertiser(data)
    setLoading(false)
  }

  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : null
  }

  const fetchSheetData = useCallback(async () => {
    if (!advertiser) return
    setFetchingSheet(true)
    setSheetError('')

    try {
      const spreadsheetId = extractSpreadsheetId(advertiser.sheet_url)
      if (!spreadsheetId) {
        setSheetError('올바르지 않은 스프레드시트 URL입니다.')
        setFetchingSheet(false)
        return
      }

      // provider_token 획득 시도 (로그인 직후에만 유효, 새로고침 후 null 가능)
      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token || null

      const response = await fetch('/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, providerToken }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const msg = errorData?.error || response.statusText
        setSheetError(msg)
        setFetchingSheet(false)
        return
      }

      const result = await response.json()
      const values: string[][] = result.values || []

      if (values.length === 0) {
        setSheetError('시트에 데이터가 없습니다.')
        setFetchingSheet(false)
        return
      }

      setSheetData(values)
    } catch (err) {
      setSheetError(`오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`)
    }
    setFetchingSheet(false)
  }, [advertiser])

  const interpretColumns = useCallback(async () => {
    if (!sheetData || sheetData.length < 2) return
    setInterpretingColumns(true)

    try {
      const headers = sheetData[0]
      const sampleRows = sheetData.slice(1, 6)

      const response = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers, sampleRows }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || '컬럼 해석에 실패했습니다.')
      }

      const data = await response.json()
      setColumnInterpretation(data.columns)
    } catch (err) {
      setSheetError(`컬럼 해석 오류: ${err instanceof Error ? err.message : String(err)}`)
    }
    setInterpretingColumns(false)
  }, [sheetData])

  const generateInsight = useCallback(async () => {
    if (!sheetData || !columnInterpretation) return
    setGeneratingInsight(true)

    try {
      const response = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetData,
          columnInterpretation,
          advertiserName: advertiser?.advertiser_name,
          advertiserId: advertiser?.id,
          analysisStart: toDateStr(analysisStart),
          analysisEnd: toDateStr(analysisEnd),
          compareStart: toDateStr(compareStart),
          compareEnd: toDateStr(compareEnd),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || '인사이트 생성에 실패했습니다.')
      }

      const data = await response.json()
      setInsightResult(data)
      loadHistory()
    } catch (err) {
      setSheetError(`인사이트 생성 오류: ${err instanceof Error ? err.message : String(err)}`)
    }
    setGeneratingInsight(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetData, columnInterpretation, advertiser])

  const handleGenerateInsight = async () => {
    setStep('fetching')
    setSheetError('')
    setInsightResult(null)
    setChatMessages([])

    // Step 1: Fetch sheet data
    if (!sheetData) {
      await fetchSheetData()
    }
  }

  const buildInsightContext = (result: InsightResult) => {
    const insightLines = result.insights.map((ins, i) =>
      `인사이트 ${i + 1}: ${ins.title}\n${ins.description}`
    ).join('\n\n')
    const nextStepLines = result.nextSteps.map(ns =>
      `[${ns.type}] ${ns.action}`
    ).join('\n')
    const reportLine = result.report ? `\n보고 멘트: ${result.report}` : ''
    return `${insightLines}\n\nNext Steps:\n${nextStepLines}${reportLine}`
  }

  const deleteHistoryEntry = async (entryId: string) => {
    if (!confirm('이 인사이트 히스토리를 삭제하시겠습니까?\n해당 기간의 학습 데이터도 함께 제거됩니다.')) return
    await supabase.from('insight_history').delete().eq('id', entryId)
    setInsightHistory(prev => prev.filter(e => e.id !== entryId))
    if (expandedHistoryId === entryId) setExpandedHistoryId(null)
  }

  const sendChatMessage = async () => {
    const trimmed = chatInput.trim()
    if (!trimmed || chatLoading || !insightResult) return

    const newMessages = [...chatMessages, { role: 'user' as const, content: trimmed }]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          insightContext: buildInsightContext(insightResult),
          advertiserName: advertiser?.advertiser_name,
        }),
      })
      const data = await res.json()
      if (data.reply) {
        setChatMessages([...newMessages, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setChatMessages([...newMessages, { role: 'assistant', content: '오류가 발생했습니다. 다시 시도해주세요.' }])
    }
    setChatLoading(false)
  }

  // Chain steps via effects
  useEffect(() => {
    if (step === 'fetching' && sheetData) {
      setStep('interpreting')
      interpretColumns()
    }
  }, [step, sheetData, interpretColumns])

  useEffect(() => {
    if (step === 'interpreting' && columnInterpretation) {
      setStep('generating')
      generateInsight()
    }
  }, [step, columnInterpretation, generateInsight])

  useEffect(() => {
    if (step === 'generating' && insightResult) {
      setStep('done')
    }
  }, [step, insightResult])

  // When fetchSheetData completes during step flow
  useEffect(() => {
    if (step === 'fetching' && !fetchingSheet && sheetData) {
      setStep('interpreting')
      interpretColumns()
    }
  }, [step, fetchingSheet, sheetData, interpretColumns])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400 text-sm">로딩 중...</p>
      </div>
    )
  }

  if (!advertiser) return null

  const isProcessing = fetchingSheet || interpretingColumns || generatingInsight

  const getStepLabel = () => {
    if (fetchingSheet) return '시트 데이터 가져오는 중...'
    if (interpretingColumns) return 'AI가 컬럼을 해석하는 중...'
    if (generatingInsight) return 'AI가 인사이트를 생성하는 중...'
    return ''
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; 대시보드
        </button>
        <h1 className="text-lg font-bold">PMK Insight</h1>
        {insightResult && (
          <span className="ml-auto text-xs text-emerald-400 bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded-md">
            추가 질문 활성화됨
          </span>
        )}
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden select-none">
      <main className="overflow-y-auto px-6 py-10" style={{ width: `${100 - rightPanelPct}%` }}>
        {/* Advertiser Info */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{advertiser.advertiser_name}</h2>
              <p className="text-sm text-gray-400 mt-1">담당자: {advertiser.manager_name}</p>
            </div>
            <a
              href={advertiser.sheet_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors bg-gray-800 px-3 py-1.5 rounded-lg"
            >
              시트 열기
            </a>
          </div>
          <p className="text-xs text-gray-600 mt-3 truncate">{advertiser.sheet_url}</p>
        </div>

        {/* Date Selection */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-medium text-gray-400 mb-4">기간 설정</h3>
          <div className="grid grid-cols-2 gap-6">
            {/* 비교 기간 - 먼저 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-gray-400 font-medium">비교 기간</label>
                <span className="text-xs text-gray-600">
                  {Math.round((compareEnd.getTime() - compareStart.getTime()) / 86400000) + 1}일 선택됨
                </span>
                <button
                  onClick={handleWeekendToggle}
                  className={`text-xs rounded px-2 py-0.5 border transition-colors cursor-pointer ${
                    weekendIncluded
                      ? 'bg-emerald-900 text-emerald-300 border-emerald-700 hover:bg-emerald-700'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-500 hover:text-gray-200'
                  }`}
                >
                  주말포함
                </button>
              </div>
              <div className="flex items-center gap-2">
                <DatePicker
                  selected={compareStart}
                  onChange={(date: Date | null) => { if (date) { setCompareStart(date); if (date > compareEnd) setCompareEnd(date) } }}
                  selectsStart
                  startDate={compareStart}
                  endDate={compareEnd}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  calendarClassName="dark-calendar"
                />
                <span className="text-gray-600 text-xs flex-shrink-0">~</span>
                <DatePicker
                  selected={compareEnd}
                  onChange={(date: Date | null) => { if (date) setCompareEnd(date) }}
                  selectsEnd
                  startDate={compareStart}
                  endDate={compareEnd}
                  minDate={compareStart}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  calendarClassName="dark-calendar"
                />
              </div>
            </div>
            {/* 기준 기간 - 나중 + 동기간 버튼 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-xs text-blue-400 font-medium">기준 기간</label>
                <button
                  onClick={() => {
                    const duration = Math.round((compareEnd.getTime() - compareStart.getTime()) / 86400000)
                    const yesterday = new Date(Date.now() - 86400000)
                    yesterday.setHours(0, 0, 0, 0)
                    const start = new Date(yesterday.getTime() - duration * 86400000)
                    setAnalysisStart(start)
                    setAnalysisEnd(yesterday)
                  }}
                  className="text-xs bg-blue-900 hover:bg-blue-700 text-blue-300 hover:text-white border border-blue-700 hover:border-blue-500 rounded px-2 py-0.5 transition-colors cursor-pointer"
                >
                  동기간 선택하기
                </button>
              </div>
              <div className="flex items-center gap-2">
                <DatePicker
                  selected={analysisStart}
                  onChange={(date: Date | null) => { if (date) { setAnalysisStart(date); if (date > analysisEnd) setAnalysisEnd(date) } }}
                  selectsStart
                  startDate={analysisStart}
                  endDate={analysisEnd}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  calendarClassName="dark-calendar"
                />
                <span className="text-gray-600 text-xs flex-shrink-0">~</span>
                <DatePicker
                  selected={analysisEnd}
                  onChange={handleAnalysisEndChange}
                  selectsEnd
                  startDate={analysisStart}
                  endDate={analysisEnd}
                  minDate={analysisStart}
                  locale={ko}
                  dateFormat="yyyy.MM.dd"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  calendarClassName="dark-calendar"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Generate Insight Button */}
        <div className="mb-8">
          <button
            onClick={handleGenerateInsight}
            disabled={isProcessing}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium rounded-xl transition-colors text-sm"
          >
            {isProcessing ? getStepLabel() : (insightResult ? '인사이트 재생성' : '인사이트 생성')}
          </button>
          {sheetError && (
            <p className="text-red-400 text-xs mt-3">{sheetError}</p>
          )}
        </div>

        {/* Column Interpretation */}
        {columnInterpretation && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-400 mb-3">컬럼 해석</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {columnInterpretation.map((col, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                  <p className="text-sm font-medium text-white">{col.column}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="text-blue-400">{col.type}</span> - {col.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {insightResult && (
          <>
            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-400 mb-4">인사이트</h3>
              <div className="flex flex-col gap-3">
                {insightResult.insights.map((insight, i) => (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex gap-3">
                      <span className="flex-shrink-0 w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-sm font-bold">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-white mb-1.5">{insight.title}</p>
                        <p className="text-sm text-gray-400 leading-relaxed">{insight.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Next Steps</h3>
              <div className="flex flex-col gap-3">
                {insightResult.nextSteps.map((ns, i) => (
                  <div key={i} className={`bg-gray-900 border rounded-xl p-5 flex gap-3 items-start ${
                    ns.type === '추천' ? 'border-blue-800' : 'border-gray-800'
                  }`}>
                    <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-md ${
                      ns.type === '추천'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {ns.type}
                    </span>
                    <p className="text-sm text-gray-200 leading-relaxed pt-0.5">{ns.action}</p>
                  </div>
                ))}
              </div>
            </div>

            {insightResult.report && (
              <div className="mb-8">
                <h3 className="text-sm font-medium text-gray-400 mb-4">광고주 보고 멘트</h3>
                <div className="bg-gray-900 border border-emerald-900 rounded-xl p-5">
                  <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">{insightResult.report}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Insight History */}
        {insightHistory.length > 0 && (
          <div className="mb-8 border-t border-gray-800 pt-8">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-sm font-medium text-gray-400">인사이트 히스토리</h3>
              <span className="text-xs text-gray-600">총 {insightHistory.length}회 분석</span>
            </div>
            <div className="flex flex-col gap-2">
              {insightHistory.map((entry) => {
                const isExpanded = expandedHistoryId === entry.id
                const date = new Date(entry.created_at)
                const dateLabel = `${date.getFullYear()}.${String(date.getMonth()+1).padStart(2,'0')}.${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
                return (
                  <div key={entry.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center">
                      <button
                        onClick={() => setExpandedHistoryId(isExpanded ? null : entry.id)}
                        className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs text-gray-500">{dateLabel}</span>
                          <span className="text-xs text-gray-400">
                            기준: {entry.analysis_start} ~ {entry.analysis_end}
                          </span>
                          {entry.compare_start && (
                            <span className="text-xs text-gray-600">
                              비교: {entry.compare_start} ~ {entry.compare_end}
                            </span>
                          )}
                          <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded">
                            인사이트 {entry.result.insights?.length || 0}개
                          </span>
                        </div>
                        <span className="text-gray-600 text-xs ml-2">{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      <button
                        onClick={() => deleteHistoryEntry(entry.id)}
                        className="px-3 py-3 text-gray-600 hover:text-red-400 transition-colors text-xs flex-shrink-0"
                        title="이 히스토리 삭제 (학습 데이터 포함)"
                      >
                        ✕
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                        <div className="flex flex-col gap-2 mb-3">
                          {entry.result.insights?.map((ins, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="flex-shrink-0 text-xs text-blue-400 font-semibold w-4">{i+1}.</span>
                              <div>
                                <p className="text-xs font-medium text-gray-300">{ins.title}</p>
                                {ins.description && (
                                  <p className="text-xs text-gray-500 mt-0.5">{ins.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {entry.result.report && (
                          <div className="bg-gray-800 rounded-lg p-3 mt-2">
                            <p className="text-xs text-gray-400 leading-relaxed">{entry.result.report}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>

      {/* Divider */}
      <div
        onMouseDown={(e) => { e.preventDefault(); isDragging.current = true }}
        className="w-1 flex-shrink-0 bg-gray-800 hover:bg-blue-500 active:bg-blue-400 cursor-col-resize transition-colors"
        title="드래그하여 크기 조절"
      />

      {/* Right Chat Panel */}
      {insightResult ? (
        <aside className="flex-shrink-0 border-l-0 flex flex-col bg-gray-950" style={{ width: `${rightPanelPct}%` }}>
          <div className="px-4 py-3 border-b border-gray-800 flex-shrink-0">
            <h3 className="text-sm font-semibold text-white">추가 질문</h3>
            <p className="text-xs text-gray-500 mt-0.5">인사이트 기반으로 AI에게 질문하세요</p>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
            {chatMessages.length === 0 && (
              <div className="text-center pt-8">
                <p className="text-xs text-gray-600">인사이트에 대해 궁금한 점을<br />자유롭게 질문해 보세요.</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-xs text-gray-600">
                  {msg.role === 'user' ? '나' : 'AI'}
                </span>
                <div className={`rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[95%] ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-start gap-1">
                <div className="bg-gray-800 rounded-xl px-3 py-2 text-sm text-gray-400">
                  답변 생성 중...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-800 flex-shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="질문 입력..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
                disabled={chatLoading}
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-xs transition-colors"
              >
                전송
              </button>
            </div>
          </div>
        </aside>
      ) : (
        <aside className="flex-shrink-0 border-l-0 flex flex-col items-center justify-center bg-gray-950" style={{ width: `${rightPanelPct}%` }}>
          <p className="text-xs text-gray-700 text-center px-6">인사이트를 생성하면<br />추가 질문을 사용할 수 있습니다.</p>
        </aside>
      )}
      </div>
    </div>
  )
}
