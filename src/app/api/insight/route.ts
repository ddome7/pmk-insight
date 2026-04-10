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

    // Limit data to prevent token overflow - send last 30 rows (most recent)
    const recentRows = dataRows.slice(-30)

    const columnDesc = (columnInterpretation as ColumnInterpretation[])
      .map((c) => `- ${c.column} (${c.type}): ${c.description}`)
      .join('\n')

    const dataPreview = [headers, ...recentRows]
      .map((row: string[]) => row.join('\t'))
      .join('\n')

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `당신은 디지털 광고 성과 분석 전문가입니다. 광고주의 스프레드시트 데이터를 분석하여 핵심 인사이트와 실행 가능한 Next Step을 제시합니다.

분석 시 다음을 포함해주세요:
- 전일 대비 주요 지표 변화
- 전주 대비 트렌드
- 전월 대비 성과 변화
- 이상 징후 또는 주목할 패턴

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "insights": [
    "인사이트 1 내용 (구체적인 수치와 함께)",
    "인사이트 2 내용",
    "인사이트 3 내용"
  ],
  "nextSteps": [
    "실행 가능한 액션 1",
    "실행 가능한 액션 2",
    "실행 가능한 액션 3"
  ]
}

인사이트는 3~5개, Next Step은 정확히 3개를 제시하세요. 모두 한국어로 작성하세요.`,
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
