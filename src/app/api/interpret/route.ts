import { createHash } from 'crypto'
import { GEMINI_MODEL, genAI, withRetry } from '@/lib/gemini'

export const maxDuration = 60

/**
 * 컬럼 해석 결과 메모리 캐시.
 * key: 헤더 + 샘플 첫 행의 SHA-256 (시트 구조 동일성 판별)
 * value: 파싱된 columns JSON
 *
 * 서버리스 인스턴스 단위로만 유효 (인스턴스 재시작 시 휘발).
 * 워밍된 컨테이너가 같은 시트로 재요청 받을 때 즉시 응답.
 */
type InterpretResult = { columns: Array<{ column: string; type: string; description: string }> }
const interpretCache = new Map<string, InterpretResult>()
const CACHE_MAX = 200 // 메모리 폭주 방지 — LRU 흉내 (오래된 키 제거)

function makeCacheKey(headers: string[], sampleRows: string[][]): string {
  const h = createHash('sha256')
  h.update(JSON.stringify(headers))
  // 샘플 데이터의 첫 행 값까지 키에 포함 — 같은 헤더라도 % 등 값 단서가 다르면 다른 결과 가능
  if (sampleRows.length > 0) h.update(JSON.stringify(sampleRows[0]))
  return h.digest('hex')
}

const SYSTEM_INSTRUCTION = `당신은 디지털 광고 데이터 분석 전문가입니다. 스프레드시트 컬럼의 의미와 타입을 분류합니다.

[타입 분류 — 6가지 중 정확히 하나]
- 날짜: 날짜/시간. 필터 기준 (합산 불가).
- 지표: 노출·클릭·전환·구매 등 정수 카운팅. 합산.
- 금액: 비용·매출·ROAS·CPC·CPM·CPA 등 금액성 지표. 합산.
- 비율: CTR·CVR·전환율·달성률·% 단위. 평균 처리.
- 텍스트: 캠페인명·소재명·매체명 등 분류용 문자열.
- 숫자: 위에 안 맞는 순수 수치. 합산.

[중요 규칙]
- 값에 % 포함 → 비율. 날짜 형식 → 날짜. 컬럼명·값 둘 다 보고 판단.
- 모르면 가장 가까운 타입으로 추론. unknown 금지.
- column 필드는 원본 헤더명 그대로.

[응답]
순수 JSON만. 마크다운 코드블록·설명문 금지.`

export async function POST(request: Request) {
  try {
    const { headers, sampleRows } = await request.json()

    if (!headers || !sampleRows || !Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return Response.json({ error: '헤더와 샘플 데이터가 필요합니다.' }, { status: 400 })
    }

    // 캐시 조회
    const cacheKey = makeCacheKey(headers, sampleRows)
    const cached = interpretCache.get(cacheKey)
    if (cached) {
      return Response.json({ ...cached, _cache: 'hit' })
    }

    const dataPreview = [headers, ...sampleRows]
      .map((row: string[]) => row.join('\t'))
      .join('\n')

    const prompt = `아래 시트의 각 컬럼을 분류하세요.

${dataPreview}

응답 JSON 형식:
{"columns":[{"column":"원본 헤더명","type":"날짜|지표|텍스트|숫자|비율|금액","description":"의미 1~2문장"}]}`

    // interpret는 retry sleep 없이 1회 시도 (sleep이 Vercel 타임아웃 악화)
    const content = await withRetry(async () => {
      const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          temperature: 0.1,
        },
      })
      const result = await model.generateContent(prompt)
      return result.response.text()
    }, 'api/interpret', 0)

    // 마크다운 코드블록 제거 후 JSON 추출
    const stripped = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim()
    const jsonMatch = stripped.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return Response.json(
        { error: 'AI 응답에서 JSON을 파싱할 수 없습니다.' },
        { status: 500 }
      )
    }

    const parsed = JSON.parse(jsonMatch[0]) as InterpretResult

    // 캐시 저장 (LRU 흉내: 초과 시 가장 오래된 키 제거)
    if (interpretCache.size >= CACHE_MAX) {
      const oldestKey = interpretCache.keys().next().value
      if (oldestKey) interpretCache.delete(oldestKey)
    }
    interpretCache.set(cacheKey, parsed)

    return Response.json(parsed)
  } catch (error) {
    console.error('[api/interpret] Error:', error)
    const msg = error instanceof Error ? error.message : String(error)
    const status = msg.includes('503') || msg.includes('429') ? 503 : 500
    return Response.json(
      { error: `컬럼 해석 실패: ${msg}. 잠시 후 다시 시도해주세요.` },
      { status }
    )
  }
}
