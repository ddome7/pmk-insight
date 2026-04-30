import { GoogleGenerativeAI, type GenerationConfig } from '@google/generative-ai'

/**
 * 전체 API에서 사용하는 Gemini 모델 단일 고정.
 * fallback 체인 사용 금지 — 응답 품질 일관성 + 디버깅 단순성 우선.
 */
export const GEMINI_MODEL = 'gemini-2.5-pro'

if (!process.env.GEMINI_API_KEY) {
  // 빌드 타임에는 미설정 가능. 런타임 첫 호출 시 실패하므로 경고만.
  console.warn('[lib/gemini] GEMINI_API_KEY 미설정 — 런타임 호출 시 실패합니다.')
}

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

/**
 * Gemini 2.5 시리즈는 기본적으로 "thinking" 모드가 활성화되어 있어,
 * maxOutputTokens 한도의 상당 부분(때로는 거의 전부)을 thoughtsTokenCount로 소비한다.
 * 그 결과 candidates(실제 응답 본문)가 잘려 finishReason: MAX_TOKENS가 되고,
 * JSON 모드에서도 부분 JSON이 반환되어 파싱이 실패하는 사고가 발생한다.
 *
 * 해결: generationConfig에 thinkingConfig.thinkingBudget을 명시적으로 작은 값으로 지정.
 * - pro: 최소 128 권장 (0 입력 시 400 INVALID_ARGUMENT)
 * - flash: 0도 허용 (thinking 완전 비활성)
 *
 * 레거시 SDK(@google/generative-ai v0.x)의 GenerationConfig 타입에는 thinkingConfig가
 * 정의돼 있지 않지만, generationConfig 객체는 그대로 REST 페이로드로 패스스루되므로
 * 런타임은 정상 처리된다. 따라서 타입을 확장하여 캐스팅 없이 넣을 수 있게 한다.
 */
export interface ThinkingConfig {
  thinkingBudget?: number
  includeThoughts?: boolean
}

export type GenerationConfigWithThinking = GenerationConfig & {
  thinkingConfig?: ThinkingConfig
}

/**
 * 표준 generationConfig 헬퍼.
 * - JSON 응답이 필요한 모든 호출에서 동일하게 사용.
 * - thinkingBudget: 256 (분석 품질은 유지하되 응답 토큰을 충분히 남김)
 * - maxOutputTokens: 호출별로 오버라이드 가능 (기본 4096 — thinking 256 + 본문 ~3800).
 */
export function jsonGenerationConfig(overrides?: Partial<GenerationConfigWithThinking>): GenerationConfigWithThinking {
  return {
    temperature: 0.2,
    maxOutputTokens: 4096,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: 256 },
    ...overrides,
  }
}

/**
 * 자유 텍스트 응답용 generationConfig 헬퍼.
 * 채팅 등 자연어 응답에 사용.
 */
export function textGenerationConfig(overrides?: Partial<GenerationConfigWithThinking>): GenerationConfigWithThinking {
  return {
    temperature: 0.7,
    maxOutputTokens: 4096,
    thinkingConfig: { thinkingBudget: 512 },
    ...overrides,
  }
}

/**
 * Gemini API 일시적 오류 판별.
 * 503 (Service Unavailable / overloaded), 429 (rate limit),
 * 500 (internal error - 일시적인 경우 재시도 가치 있음),
 * 그리고 메시지 기반 휴리스틱.
 */
function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('service unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('deadline') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  )
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

/**
 * Exponential backoff 재시도 래퍼.
 * 기본 1s → 2s → 4s (최대 3회 재시도, 총 4회 시도).
 * 일시적 오류만 재시도. 그 외는 즉시 throw.
 *
 * @param fn 재시도 대상 비동기 함수
 * @param label 로깅용 라벨 (api 이름 등)
 * @param maxRetries 재시도 횟수 (기본 3 — 총 4회 시도)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientError(err) || attempt === maxRetries) {
        throw err
      }
      const delayMs = 1000 * Math.pow(2, attempt) // 1s, 2s, 4s
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(
        `[${label}] 일시적 오류 — ${delayMs}ms 후 재시도 (${attempt + 1}/${maxRetries}): ${msg.slice(0, 200)}`
      )
      await sleep(delayMs)
    }
  }
  // 도달 불가 — 만족시키기 위한 throw
  throw lastErr
}
