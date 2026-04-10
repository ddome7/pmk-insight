import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(request: Request) {
  try {
    const { headers, sampleRows } = await request.json()

    if (!headers || !sampleRows || !Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return Response.json(
        { error: '헤더와 샘플 데이터가 필요합니다.' },
        { status: 400 }
      )
    }

    const dataPreview = [headers, ...sampleRows]
      .map((row: string[]) => row.join('\t'))
      .join('\n')

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `당신은 광고 데이터 분석 전문가입니다. 스프레드시트의 헤더와 샘플 데이터를 보고, 각 컬럼이 무엇을 의미하는지 해석해주세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.

{
  "columns": [
    {
      "column": "컬럼 헤더명",
      "type": "날짜|지표|텍스트|숫자|비율|금액 중 하나",
      "description": "이 컬럼에 대한 간단한 설명"
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `다음 스프레드시트 데이터의 각 컬럼을 해석해주세요:\n\n${dataPreview}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 2048,
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
    return Response.json(parsed)
  } catch (error) {
    console.error('[api/interpret] Error:', error)
    return Response.json(
      { error: `컬럼 해석 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
