import { createClient } from '@/lib/supabase/server'
import { GEMINI_MODEL, genAI, textGenerationConfig, withRetry } from '@/lib/gemini'

export const maxDuration = 60

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const {
      messages, insightContext, advertiserName,
      summaryTable, analysisStart, analysisEnd, compareStart, compareEnd,
    } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const systemPrompt = `당신은 디지털 광고 퍼포먼스 마케터입니다. 광고주 데이터와 인사이트를 바탕으로 매니저의 추가 질문에 친절하고 실무적으로 답변합니다.

광고주: ${advertiserName || '미지정'}
분석 기간: ${analysisStart} ~ ${analysisEnd}${compareStart ? ` / 비교: ${compareStart} ~ ${compareEnd}` : ''}

[기간별 집계 요약]
${summaryTable || '(집계 데이터 없음)'}

${insightContext ? `[AI 인사이트 요약]\n${insightContext}` : ''}

답변 원칙:
- 위 집계 요약을 참조하여 정확한 수치로 답변하세요.
- 데이터에 없는 내용은 추측하지 마세요.
- 간결하게 한국어로 답변하세요.`

    // Gemini history: 마지막 메시지 제외한 이전 대화
    const history = (messages as ChatMessage[]).slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    const lastMessage = (messages as ChatMessage[]).at(-1)!

    const reply = await withRetry(async () => {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: systemPrompt,
        generationConfig: textGenerationConfig(),
      })
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(lastMessage.content)
      return result.response.text()
    }, 'api/chat')

    return Response.json({ reply })
  } catch (error) {
    console.error('[api/chat] Error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    const status = msg.includes('503') || msg.includes('429') ? 503 : 500
    return Response.json(
      { error: `채팅 응답 실패: ${msg}. 잠시 후 다시 시도해주세요.` },
      { status }
    )
  }
}
