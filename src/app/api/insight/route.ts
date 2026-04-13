import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ColumnInterpretation {
  column: string
  type: string
  description: string
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

export async function POST(request: Request) {
  try {
    const {
      sheetData, columnInterpretation, advertiserName,
      analysisStart, analysisEnd, compareStart, compareEnd
    } = await request.json()

    if (!sheetData || !columnInterpretation) {
      return Response.json({ error: '시트 데이터와 컬럼 해석이 필요합니다.' }, { status: 400 })
    }

    const headers: string[] = sheetData[0]
    const dataRows: string[][] = sheetData.slice(1)

    // 날짜 기반 필터링
    const analysisRows = filterRowsByDateRange(headers, dataRows, columnInterpretation, analysisStart, analysisEnd)
    const compareRows = filterRowsByDateRange(headers, dataRows, columnInterpretation, compareStart, compareEnd)

    // 필터된 데이터가 없으면 최근 15행 폴백
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

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주 데이터를 분석해 실무에서 즉시 활용 가능한 인사이트와 보고서를 제공합니다.

[인사이트 원칙]
- 단순 수치 나열 금지. 반드시 원인과 비즈니스적 의미를 해석하세요.
- 데이터에 없는 내용 추측 금지. 근거 있는 분석만 작성하세요.
- 기준 기간과 비교 기간의 데이터를 실제로 비교 분석하세요.
- 인사이트는 최대 5개, 유의미한 것만 선별하세요.

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
${comparePreview}

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

    // 혹시 모델이 string[] 형태로 응답한 경우 자동 변환
    const normalizedInsights = parsed.insights.map((item: unknown) =>
      typeof item === 'string' ? { title: item, description: '' } : item
    )
    const normalizedNextSteps = parsed.nextSteps.map((item: unknown) =>
      typeof item === 'string' ? { type: '추천', action: item } : item
    )

    return Response.json({
      insights: normalizedInsights,
      nextSteps: normalizedNextSteps,
      report: parsed.report || '',
    })
  } catch (error) {
    console.error('[api/insight] Error:', error)
    return Response.json(
      { error: `인사이트 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
