import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const { messages, insightContext, advertiserName } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const systemPrompt = `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 방금 생성된 광고주 인사이트를 바탕으로 매니저의 추가 질문에 친절하고 실무적으로 답변합니다.

${insightContext ? `[현재 분석된 인사이트 컨텍스트]
광고주: ${advertiserName || '미지정'}

${insightContext}` : ''}

답변 원칙:
- 인사이트 컨텍스트를 기반으로 구체적인 답변을 제공하세요.
- 데이터에 없는 내용은 추측하지 말고, 불확실할 때는 명시하세요.
- 실무에서 즉시 활용 가능한 내용으로 간결하게 답변하세요.
- 한국어로 답변하세요.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: (messages as ChatMessage[]).map(m => ({
        role: m.role,
        content: m.content,
      })),
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    return Response.json({ reply: content })
  } catch (error) {
    console.error('[api/chat] Error:', error)
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
