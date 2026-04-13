import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const columnDesc = (columnInterpretation as ColumnInterpretation[])
      .map((c) => `- ${c.column} (${c.type}): ${c.description}`)
      .join('\n')

    const truncate = (cell: string) => cell?.length > 150 ? cell.slice(0, 150) + '…' : cell

    const analysisPreview = [headers, ...useAnalysisRows]
      .map(row => row.map(truncate).join('\t')).join('\n')

    const comparePreview = useCompareRows.length > 0
      ? [headers, ...useCompareRows].map(row => row.map(truncate).join('\t')).join('\n')
      : '(해당 기간 데이터 없음)'

    // 광고주 히스토리 조회 (최근 5회)
    let historyContext = ''
    const supabase = await createClient()
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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주 데이터를 분석해 실무에서 즉시 활용 가능한 인사이트와 보고서를 제공합니다.

[인사이트 원칙]
- 단순 수치 나열 금지. 반드시 원인과 비즈니스적 의미를 해석하세요.
- 데이터에 없는 내용 추측 금지. 근거 있는 분석만 작성하세요.
- 기준 기간과 비교 기간의 데이터를 실제로 비교 분석하세요.
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

반드시 아래 JSON 형식으로만 응답하세요:

{
  "insights": [
    { "title": "인사이트 대제목", "description": "상세 내용 (원인, 의미 포함)" }
  ],
  "nextSteps": [
    { "type": "추천", "action": "즉시 실행할 구체적 액션" },
    { "type": "고려", "action": "선택적으로 검토할 액션" }
  ],
  "report": "광고주에게 보고할 내용을 자연스러운 문장으로 작성"
}`,
      messages: [
        {
          role: 'user',
          content: `광고주명: ${advertiserName || '미지정'}
기준 기간: ${analysisStart} ~ ${analysisEnd} (${useAnalysisRows.length}행)
비교 기간: ${compareStart} ~ ${compareEnd} (${useCompareRows.length}행)

[컬럼 정의]
${columnDesc}

[기준 기간 데이터]
${analysisPreview}

[비교 기간 데이터]
${comparePreview}${historyContext}

위 데이터를 기반으로 기준 기간과 비교 기간을 비교 분석하고, JSON 형식으로 인사이트/넥스트스텝/보고서를 작성해주세요.`,
        },
      ],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''

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
