import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

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

    // Limit data to prevent token overflow - send last 10 rows (most recent)
    const recentRows = dataRows.slice(-10)

    const columnDesc = (columnInterpretation as ColumnInterpretation[])
      .map((c) => `- ${c.column} (${c.type}): ${c.description}`)
      .join('\n')

    const dataPreview = [headers, ...recentRows]
      .map((row: string[]) => row.map((cell: string) => (cell?.length > 100 ? cell.slice(0, 100) + '…' : cell)).join('\t'))
      .join('\n')

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주의 데이터를 보고 단순한 수치 변화가 아닌, 실제 비즈니스에 의미 있는 인사이트를 도출합니다.

[분석 원칙]
- 수치 변동 나열 금지. "A가 B로 줄었습니다"는 인사이트가 아닙니다.
- 왜(Why) 이 현상이 일어났는지, 무엇이 문제/기회인지를 해석하세요.
- 데이터에서 보이는 패턴, 이상 징후, 놓치고 있는 기회를 찾으세요.
- 전체 캠페인 건강도, 효율성, 리스크를 종합 판단하세요.
- 광고주가 매니저에게 "그래서 어떻게 해야 해요?"라고 물었을 때 답이 되는 인사이트여야 합니다.

[인사이트 예시 - 좋음]
"유료 전환율이 지속적으로 하락 중이며, 회원가입 대비 구독 전환율이 20% 미만으로 떨어졌습니다. 유입은 유지되고 있으나 온보딩 또는 결제 단계에서 이탈이 발생하고 있을 가능성이 높습니다."

[인사이트 예시 - 나쁨 (금지)]
"전일 대비 회원가입 수는 45건 감소하였습니다."

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "insights": [
    "인사이트 1 (원인과 비즈니스 의미 포함)",
    "인사이트 2",
    "인사이트 3"
  ],
  "nextSteps": [
    "구체적이고 즉시 실행 가능한 액션 1",
    "액션 2",
    "액션 3"
  ]
}

인사이트는 3~5개, Next Step은 정확히 3개. 모두 한국어로 작성하세요.`,
        },
        {
          role: 'user',
          content: `광고주명: ${advertiserName || '미지정'}

컬럼 해석:
${columnDesc}

데이터 (최근 ${recentRows.length}행):
${dataPreview}

위 데이터를 분석하고 인사이트와 Next Step을 JSON으로 제시해주세요.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    })

    const content = completion.choices[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { error: 'AI 응답에서 JSON을 파싱할 수 없습니다.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate structure
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
