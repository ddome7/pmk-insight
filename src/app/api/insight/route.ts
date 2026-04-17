import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@/lib/supabase/server'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

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

interface ColumnInterpretationExtended extends ColumnInterpretation {
  description: string
}

interface ColumnSummary {
  column: string
  type: string
  description: string
  analysisValue: number | null
  compareValue: number | null
  delta: number | null
  deltaPercent: number | null
}

interface HistoryRecord {
  analysis_start: string
  analysis_end: string
  result: {
    insights?: InsightItem[]
    nextSteps?: NextStepItem[]
    report?: string
  }
}

function filterRowsByDateRange(
  headers: string[],
  dataRows: string[][],
  columnInterpretation: ColumnInterpretation[],
  startDate: string,
  endDate: string
): string[][] {
  const dateCol = columnInterpretation.find(c => c.type === '날짜')
  if (!dateCol) return dataRows

  const dateColIdx = headers.findIndex(h =>
    h === dateCol.column || h.includes(dateCol.column) || dateCol.column.includes(h)
  )
  if (dateColIdx === -1) return dataRows

  return dataRows.filter(row => {
    const cellVal = row[dateColIdx]?.trim() || ''
    const normalized = cellVal.replace(/\./g, '-').replace(/\//g, '-')
    return normalized >= startDate && normalized <= endDate
  })
}

function parseNumber(val: string): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null
  const cleaned = val.replace(/,/g, '').replace(/%/g, '').replace(/원/g, '').replace(/₩/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

function computeSummary(
  headers: string[],
  analysisRows: string[][],
  compareRows: string[][],
  columnInterpretation: ColumnInterpretationExtended[]
): ColumnSummary[] {
  const numericTypes = ['지표', '숫자', '금액', '비율']

  return columnInterpretation
    .filter(c => numericTypes.includes(c.type))
    .map(col => {
      const colIdx = headers.findIndex(
        h => h === col.column || h.includes(col.column) || col.column.includes(h)
      )
      if (colIdx === -1) return null

      const isRate = col.type === '비율'

      const extractValues = (rows: string[][]) =>
        rows.map(r => parseNumber(r[colIdx] || '')).filter((v): v is number => v !== null)

      const aVals = extractValues(analysisRows)
      const cVals = extractValues(compareRows)

      const aggregate = (vals: number[]) => {
        if (vals.length === 0) return null
        return isRate
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : vals.reduce((a, b) => a + b, 0)
      }

      const aVal = aggregate(aVals)
      const cVal = aggregate(cVals)
      const delta = aVal !== null && cVal !== null ? aVal - cVal : null
      const deltaPercent =
        delta !== null && cVal !== null && cVal !== 0 ? (delta / Math.abs(cVal)) * 100 : null

      return { column: col.column, type: col.type, description: col.description, analysisValue: aVal, compareValue: cVal, delta, deltaPercent }
    })
    .filter((v): v is ColumnSummary => v !== null)
}

function formatSummaryTable(summary: ColumnSummary[], analysisLabel: string, compareLabel: string): string {
  if (summary.length === 0) return '(집계 가능한 수치 컬럼 없음)'

  const fmt = (v: number | null, type: string) => {
    if (v === null) return '-'
    if (type === '비율') return v.toFixed(2) + '%'
    if (type === '금액') return '₩' + Math.round(v).toLocaleString()
    return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)
  }

  const fmtDelta = (v: number | null, pct: number | null, type: string) => {
    if (v === null) return '-'
    const sign = v >= 0 ? '+' : ''
    const valStr = type === '비율'
      ? `${sign}${v.toFixed(2)}%p`
      : type === '금액'
        ? `${sign}₩${Math.round(v).toLocaleString()}`
        : `${sign}${Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)}`
    const pctStr = pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''
    return valStr + pctStr
  }

  const header = `컬럼\t${analysisLabel}(기준)\t${compareLabel}(비교)\t증감`
  const rows = summary.map(s =>
    `${s.column}\t${fmt(s.analysisValue, s.type)}\t${fmt(s.compareValue, s.type)}\t${fmtDelta(s.delta, s.deltaPercent, s.type)}`
  )
  return [header, ...rows].join('\n')
}

function buildHistoryContext(history: HistoryRecord[]): string {
  if (history.length === 0) return ''

  const lines = history.map((h, i) => {
    const insightTitles = h.result.insights?.map(ins => `  • ${ins.title}`).join('\n') || '  (없음)'
    const report = h.result.report || '-'
    return `[${i + 1}차] ${h.analysis_start} ~ ${h.analysis_end}\n인사이트:\n${insightTitles}\n보고 요약: ${report}`
  })

  return `\n\n[이 광고주의 과거 인사이트 히스토리 (최근 ${history.length}회)]\n` +
    '이 히스토리를 참고하여 반복 패턴, 개선 여부, 지속 이슈를 파악하고 신규 인사이트에 반영하세요.\n\n' +
    lines.join('\n\n')
}

export async function POST(request: Request) {
  try {
    const {
      sheetData, columnInterpretation, advertiserName,
      analysisStart, analysisEnd, compareStart, compareEnd,
      advertiserId,
    } = await request.json()

    if (!sheetData || !columnInterpretation) {
      return Response.json({ error: '시트 데이터와 컬럼 해석이 필요합니다.' }, { status: 400 })
    }

    const headers: string[] = sheetData[0]
    const dataRows: string[][] = sheetData.slice(1)

    // 날짜 기반 필터링
    const analysisRows = filterRowsByDateRange(headers, dataRows, columnInterpretation, analysisStart, analysisEnd)
    const compareRows = filterRowsByDateRange(headers, dataRows, columnInterpretation, compareStart, compareEnd)

    const useAnalysisRows = analysisRows.length > 0 ? analysisRows : dataRows.slice(-15)
    const useCompareRows = compareRows.length > 0 ? compareRows : []

    const columnDesc = (columnInterpretation as ColumnInterpretationExtended[])
      .map((c) => `- ${c.column} (${c.type}): ${c.description}`)
      .join('\n')

    // 서버에서 기간별 수치 집계 (AI가 직접 계산하지 않도록)
    const summary = computeSummary(
      headers, useAnalysisRows, useCompareRows,
      columnInterpretation as ColumnInterpretationExtended[]
    )
    const summaryTable = formatSummaryTable(summary, analysisStart + '~' + analysisEnd, compareStart + '~' + compareEnd)

    const truncate = (cell: string) => cell?.length > 100 ? cell.slice(0, 100) + '…' : cell

    // 원본 행은 최대 50행으로 제한 (토큰 절감)
    const CAP = 50
    const analysisPreview = [headers, ...useAnalysisRows.slice(0, CAP)]
      .map(row => row.map(truncate).join('\t')).join('\n')
      + (useAnalysisRows.length > CAP ? `\n… (${useAnalysisRows.length - CAP}행 생략)` : '')

    const comparePreview = useCompareRows.length > 0
      ? [headers, ...useCompareRows.slice(0, CAP)].map(row => row.map(truncate).join('\t')).join('\n')
        + (useCompareRows.length > CAP ? `\n… (${useCompareRows.length - CAP}행 생략)` : '')
      : '(해당 기간 데이터 없음)'

    // 광고주 히스토리 조회 (최근 5회) + 매니저 에이전트 조회
    let historyContext = ''
    let agentPersonaContext = ''
    const supabase = await createClient()

    // 현재 로그인 유저 확인
    const { data: { user } } = await supabase.auth.getUser()

    // 광고주 소유자 확인 (담당 매니저 판별)
    let isOwnAdvertiser = false
    if (advertiserId && user) {
      const { data: advData } = await supabase
        .from('advertisers')
        .select('user_id')
        .eq('id', advertiserId)
        .single()
      isOwnAdvertiser = advData?.user_id === user.id
    }

    if (advertiserId) {
      const { data: historyData } = await supabase
        .from('insight_history')
        .select('analysis_start, analysis_end, result')
        .eq('advertiser_id', advertiserId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (historyData && historyData.length > 0) {
        historyContext = buildHistoryContext([...historyData].reverse() as HistoryRecord[])
      }
    }

    // 매니저 에이전트 조회 (본인 광고주일 때만 적용)
    if (user) {
      const { data: agentData } = await supabase
        .from('manager_agents')
        .select('id, agent_name, persona, tone')
        .eq('user_id', user.id)
        .single()

      if (!agentData) {
        await supabase.from('manager_agents').insert({
          user_id: user.id,
          manager_name: advertiserName || '매니저',
          agent_name: '',
          persona: '',
          tone: '',
        })
      } else if (isOwnAdvertiser) {
        // 본인 광고주일 때만 에이전트 페르소나 적용
        const parts: string[] = []
        if (agentData.persona) parts.push(`분석 방향: ${agentData.persona}`)
        if (agentData.tone) parts.push(`말투·보고 스타일: ${agentData.tone}`)
        if (parts.length > 0) {
          const nameLabel = agentData.agent_name ? `[${agentData.agent_name}] ` : ''
          agentPersonaContext = `\n\n${nameLabel}[담당 매니저 에이전트 가이드]\n${parts.join('\n')}`
        }
      }
    }

    const systemInstruction = `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주 데이터를 분석해 실무에서 즉시 활용 가능한 인사이트와 보고서를 제공합니다.${agentPersonaContext}

[수치 사용 원칙 — 최우선]
- 유저 메시지의 "[기간별 집계 요약]" 표에 있는 수치를 그대로 사용하세요. 직접 계산하거나 추정하지 마세요.
- 인사이트·보고서에 언급하는 모든 수치(합계, 평균, 증감률)는 이 표에서만 가져오세요.
- 표에 없는 수치는 언급하지 마세요. "약 ~%" 등 추정 표현 금지.

[인사이트 원칙]
- 단순 수치 나열 금지. 반드시 원인과 비즈니스적 의미를 해석하세요.
- 데이터에 없는 내용 추측 금지. 근거 있는 분석만 작성하세요.
- 기준 기간과 비교 기간의 집계 요약을 실제로 비교 분석하세요.
- 인사이트는 최대 5개, 유의미한 것만 선별하세요.
- 과거 히스토리가 제공된 경우, 반복 패턴·지속 이슈·개선 여부를 반드시 언급하세요.

[Next Step 원칙]
- type: "추천" = AI가 즉시 실행을 강력 권고하는 액션
- type: "고려" = 상황에 따라 선택적으로 진행할 수 있는 액션
- 구체적 수치와 방향이 포함된 실행 가능한 액션으로 작성하세요.
- Next Step은 2~4개 (추천 최소 1개 필수).

[보고서 원칙]
- 광고주에게 직접 전달할 수 있는 수준의 요약 보고 멘트를 작성하세요.
- 매니저가 바로 복사해서 쓸 수 있는 자연스러운 한국어 문장으로 작성하세요.
- 3~5문장으로 간결하게 작성하세요.
- 핵심 수치, 중요한 키워드, 주목해야 할 변화는 반드시 **텍스트** 형식으로 강조하세요. (예: **ROAS 2.4배**, **전주 대비 +32%**, **노출 급감**)

반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록 없이 순수 JSON만 출력하세요:

{
  "insights": [
    { "title": "인사이트 대제목", "description": "상세 내용 (원인, 의미 포함)" }
  ],
  "nextSteps": [
    { "type": "추천", "action": "즉시 실행할 구체적 액션" },
    { "type": "고려", "action": "선택적으로 검토할 액션" }
  ],
  "report": "광고주에게 보고할 내용을 자연스러운 문장으로 작성"
}`

    const userPrompt = `광고주명: ${advertiserName || '미지정'}
기준 기간: ${analysisStart} ~ ${analysisEnd} (${useAnalysisRows.length}행)
비교 기간: ${compareStart} ~ ${compareEnd} (${useCompareRows.length}행)

[컬럼 정의]
${columnDesc}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기간별 집계 요약 — 서버 사전 계산값]
⚠️ 아래 수치는 서버에서 정확히 계산된 값입니다. 인사이트와 보고서에서 수치를 언급할 때는 반드시 이 표의 값을 그대로 사용하세요. 직접 재계산하지 마세요.

${summaryTable}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[원본 데이터 — 행별 추이·패턴 파악용 참고 자료]
기준 기간:
${analysisPreview}

비교 기간:
${comparePreview}${historyContext}

위 집계 요약과 원본 데이터를 참고하여 기준 기간과 비교 기간을 비교 분석하고, JSON 형식으로 인사이트/넥스트스텝/보고서를 작성해주세요.`

    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    })

    const geminiResult = await geminiModel.generateContent(userPrompt)
    const content = geminiResult.response.text()

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json({ error: 'AI 응답에서 JSON을 파싱할 수 없습니다.' }, { status: 500 })
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.insights) || !Array.isArray(parsed.nextSteps)) {
      return Response.json({ error: 'AI 응답 형식이 올바르지 않습니다.' }, { status: 500 })
    }

    const normalizedInsights: InsightItem[] = parsed.insights.map((item: unknown) =>
      typeof item === 'string' ? { title: item, description: '' } : item as InsightItem
    )
    const normalizedNextSteps: NextStepItem[] = parsed.nextSteps.map((item: unknown) =>
      typeof item === 'string' ? { type: '추천', action: item } : item as NextStepItem
    )

    const finalResult = {
      insights: normalizedInsights,
      nextSteps: normalizedNextSteps,
      report: parsed.report || '',
      summaryTable,
    }

    // 히스토리 저장 (광고주 ID가 있는 경우)
    if (advertiserId) {
      await supabase.from('insight_history').insert({
        advertiser_id: advertiserId,
        analysis_start: analysisStart,
        analysis_end: analysisEnd,
        compare_start: compareStart || null,
        compare_end: compareEnd || null,
        result: finalResult,
      })
    }

    return Response.json(finalResult)
  } catch (error) {
    console.error('[api/insight] Error:', error)
    return Response.json(
      { error: `인사이트 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
