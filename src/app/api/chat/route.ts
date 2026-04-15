import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildRawDataBlock(
  headers: string[] | undefined,
  analysisRows: string[][] | undefined,
  compareRows: string[][] | undefined,
  analysisStart: string,
  analysisEnd: string,
  compareStart: string,
  compareEnd: string
): string {
  if (!headers || !analysisRows) return ''

  const truncate = (cell: string) => cell?.length > 100 ? cell.slice(0, 100) + '…' : cell
  const fmt = (rows: string[][]) =>
    [headers, ...rows].map(r => r.map(truncate).join('\t')).join('\n')

  const blocks: string[] = []
  blocks.push(`[기준 기간 원본 데이터: ${analysisStart} ~ ${analysisEnd} (${analysisRows.length}행)]\n${fmt(analysisRows)}`)
  if (compareRows && compareRows.length > 0) {
    blocks.push(`[비교 기간 원본 데이터: ${compareStart} ~ ${compareEnd} (${compareRows.length}행)]\n${fmt(compareRows)}`)
  }
  return blocks.join('\n\n')
}

export async function POST(request: Request) {
  try {
    const {
      messages, insightContext, advertiserName,
      summaryTable, analysisRows, compareRows, headers,
      analysisStart, analysisEnd, compareStart, compareEnd,
    } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const rawDataBlock = buildRawDataBlock(headers, analysisRows, compareRows, analysisStart, analysisEnd, compareStart, compareEnd)

    const systemPrompt = `당신은 10년 경력의 디지털 광고 퍼포먼스 마케터입니다. 광고주 데이터와 인사이트를 바탕으로 매니저의 추가 질문에 친절하고 실무적으로 답변합니다.

광고주: ${advertiserName || '미지정'}
분석 기간: ${analysisStart} ~ ${analysisEnd}${compareStart ? ` / 비교: ${compareStart} ~ ${compareEnd}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[기간별 집계 요약 — 서버 사전 계산값]
${summaryTable || '(집계 데이터 없음)'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${insightContext ? `[AI가 도출한 인사이트]\n${insightContext}\n` : ''}
${rawDataBlock ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n[원본 행별 데이터 — 상세 질문 참고용]\n${rawDataBlock}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

답변 원칙:
- 위 집계 요약과 원본 데이터를 직접 참조하여 정확한 수치로 답변하세요.
- URL 접근, 외부 링크 열람 없이도 위 데이터만으로 모든 질문에 답변할 수 있습니다.
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
