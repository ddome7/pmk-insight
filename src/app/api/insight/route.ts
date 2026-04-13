import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ColumnInterpretation {
  column: string
  type: string
  description: string
}

export async function POST(request: Request) {
  try {
    const { sheetData, columnInterpretation, advertiserName } = await request.json()

    if (!sheetData || !columnInterpretation) {
      return Response.json(
        { error: '시트 데이터와 컬럼 해석이 필요합니다.' },
        { status: 400 }
      )
    }

    const headers: string[] = sheetData[0]
    const dataRows: string[][] = sheetData.slice(1)
    const recentRows = dataRows.slice(-15)

    const columnDesc = (columnInterpretation as ColumnInterpretation[])
      .map((c) => `- ${c.column} (${c.type}): ${c.description}`)
      .join('\n')

    const dataPreview = [headers, ...recentRows]
      .map((row: string[]) => row.map((cell: string) => (cell?.length > 100 ? cell.slice(0, 100) + '…' : cell)).join('\t'))
      .join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주의 데이터를 분석해 실무에서 즉시 활용 가능한 인사이트를 제공합니다.

[절대 금지]
- "A 수치가 B로 변했습니다" 같은 단순 수치 나열
- 데이터에 없는 내용 추측
- 모호한 표현 ("개선이 필요합니다", "주목할 필요가 있습니다")

[반드시 포함]
- 수치 변화의 원인 해석 (왜 이런 결과가 나왔는지)
- 캠페인 효율성 판단 (현재 광고가 잘 되고 있는지, 문제가 있는지)
- 놓치고 있는 기회 또는 즉시 대응해야 할 위험 신호
- 매니저가 광고주에게 보고할 때 바로 쓸 수 있는 문장 수준

[Next Step 기준]
- 오늘 또는 이번 주 안에 실행 가능한 구체적 액션
- "검토해보세요" 금지, 구체적 수치와 방향이 포함된 액션

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:

{
  "insights": [
    "인사이트 1",
    "인사이트 2",
    "인사이트 3"
  ],
  "nextSteps": [
    "액션 1",
    "액션 2",
    "액션 3"
  ]
}

인사이트 3~5개, Next Step 정확히 3개. 모두 한국어.`,
      messages: [
        {
          role: 'user',
          content: `광고주명: ${advertiserName || '미지정'}

[컬럼 정의]
${columnDesc}

[데이터 - 최근 ${recentRows.length}행]
${dataPreview}

이 데이터를 바탕으로 광고 성과 인사이트와 Next Step을 JSON으로 제시해주세요.`,
        },
      ],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { error: 'AI 응답에서 JSON을 파싱할 수 없습니다.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.insights) || !Array.isArray(parsed.nextSteps)) {
      return Response.json(
        { error: 'AI 응답 형식이 올바르지 않습니다.' },
        { status: 500 }
      )
    }

    return Response.json(parsed)
  } catch (error) {
    console.error('[api/insight] Error:', error)
    return Response.json(
      { error: `인사이트 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
