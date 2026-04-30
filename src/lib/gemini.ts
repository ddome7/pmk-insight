import { GoogleGenerativeAI } from '@google/generative-ai'

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
