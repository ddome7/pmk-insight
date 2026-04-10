'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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

interface InsightResult {
  insights: string[]
  nextSteps: string[]
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
  const [step, setStep] = useState<'idle' | 'fetching' | 'interpreting' | 'generating' | 'done'>('idle')

  useEffect(() => {
    loadAdvertiser()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData?.error || '인사이트 생성에 실패했습니다.')
      }

      const data = await response.json()
      setInsightResult(data)
    } catch (err) {
      setSheetError(`인사이트 생성 오류: ${err instanceof Error ? err.message : String(err)}`)
    }
    setGeneratingInsight(false)
  }, [sheetData, columnInterpretation, advertiser])

  const handleGenerateInsight = async () => {
    setStep('fetching')
    setSheetError('')
    setInsightResult(null)

    // Step 1: Fetch sheet data
    if (!sheetData) {
      await fetchSheetData()
    }
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
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; 대시보드
        </button>
        <h1 className="text-lg font-bold">PMK Insight</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
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
                      <p className="text-sm text-gray-200 leading-relaxed">{insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Next Steps</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {insightResult.nextSteps.map((step, i) => (
                  <div key={i} className="bg-gray-900 border border-blue-900 rounded-xl p-5">
                    <p className="text-xs text-blue-400 font-medium mb-2">Step {i + 1}</p>
                    <p className="text-sm text-gray-200 leading-relaxed">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Chat Input (UI only) */}
        <div className="border-t border-gray-800 pt-6">
          <h3 className="text-sm font-medium text-gray-400 mb-3">추가 질문</h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="인사이트에 대해 추가 질문을 입력하세요..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              disabled
              className="px-6 py-3 bg-gray-700 text-gray-400 rounded-xl text-sm cursor-not-allowed"
              title="다음 업데이트에서 지원됩니다"
            >
              전송
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-2">* 채팅 기능은 다음 업데이트에서 지원됩니다.</p>
        </div>
      </main>
    </div>
  )
}
