/**
 * Google Sheets API 호출 전략 (우선순위):
 *
 * 1. GOOGLE_API_KEY — 서버 환경변수에 API Key가 있으면 사용.
 *    시트가 "링크가 있는 모든 사용자에게 공개"로 설정되어 있어야 함.
 *    OAuth 토큰 불필요, 가장 안정적.
 *
 * 2. providerToken — 클라이언트에서 전달받은 Google OAuth access token.
 *    로그인 직후에만 유효하고, 페이지 새로고침 후 null이 되는 한계가 있음.
 *    비공개 시트 접근 시 필요.
 *
 * 두 방법 모두 실패하면 명확한 에러 메시지를 반환한다.
 *
 * 특정 탭 지원:
 * - body에 gid가 포함된 경우, 메타데이터 API로 sheets.properties를 조회해
 *   해당 sheetId(gid)에 대응하는 title을 찾고 `'{title}'!A1:Z500` range로 읽는다.
 * - gid 매칭 실패 또는 메타데이터 조회 실패 시: 첫 시트(A1:Z500)로 fallback.
 */

const DEFAULT_RANGE = 'A1:Z500'

type SheetTabInfo = { title: string; sheetId: number }

// 시트 이름을 range에 안전하게 인용. 시트 이름 내부 작은따옴표는 ''로 이스케이프.
function quoteSheetTitle(title: string): string {
  return `'${title.replace(/'/g, "''")}'`
}

async function resolveTabTitle(
  spreadsheetId: string,
  gid: string,
  authHeader: Record<string, string> | null,
  apiKeyQuery: string,
): Promise<string | null> {
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties${apiKeyQuery}`
    const res = await fetch(metaUrl, authHeader ? { headers: authHeader } : undefined)
    if (!res.ok) {
      console.warn('[api/sheets] Metadata fetch failed:', res.status, res.statusText)
      return null
    }
    const meta = await res.json()
    const sheets: Array<{ properties?: SheetTabInfo }> = meta?.sheets || []
    const gidNum = Number(gid)
    if (Number.isNaN(gidNum)) return null
    const matched = sheets.find((s) => s.properties?.sheetId === gidNum)
    return matched?.properties?.title || null
  } catch (err) {
    console.warn('[api/sheets] Metadata fetch error:', err)
    return null
  }
}

export async function POST(request: Request) {
  try {
    const { spreadsheetId, providerToken, gid } = await request.json()

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return Response.json(
        { error: '유효한 spreadsheetId가 필요합니다.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_API_KEY
    const apiKeyQuery = apiKey ? `&key=${apiKey}` : ''
    const buildValuesUrl = (range: string) =>
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`

    // gid → 시트 이름 변환 시도. 실패하면 null로 두고 기존 방식(A1:Z500, 첫 시트)으로 fallback.
    let resolvedRange = DEFAULT_RANGE
    if (gid && typeof gid === 'string') {
      // 메타 조회는 API Key 우선, 실패 시 providerToken으로 재시도
      let title: string | null = null
      if (apiKey) {
        title = await resolveTabTitle(spreadsheetId, gid, null, apiKeyQuery)
      }
      if (!title && providerToken) {
        title = await resolveTabTitle(
          spreadsheetId,
          gid,
          { Authorization: `Bearer ${providerToken}` },
          ''
        )
      }
      if (title) {
        resolvedRange = `${quoteSheetTitle(title)}!${DEFAULT_RANGE}`
        console.log(`[api/sheets] Resolved gid=${gid} to tab: "${title}"`)
      } else {
        console.warn(`[api/sheets] Could not resolve gid=${gid}, falling back to first sheet`)
      }
    }

    const sheetsUrl = buildValuesUrl(resolvedRange)

    // Strategy 1: API Key (public/shared sheets)
    if (apiKey) {
      console.log('[api/sheets] Attempting with API Key, range=', resolvedRange)
      const sheetsResponse = await fetch(`${sheetsUrl}?key=${apiKey}`)

      if (sheetsResponse.ok) {
        const result = await sheetsResponse.json()
        return Response.json({ values: result.values || [] })
      }

      // API Key failed — log it and try provider token fallback
      const errorData = await sheetsResponse.json().catch(() => ({}))
      const apiKeyError = errorData?.error?.message || sheetsResponse.statusText
      console.warn('[api/sheets] API Key failed (sheet may be private):', apiKeyError)

      // If we also have a provider token, fall through to try it
      if (!providerToken) {
        return Response.json(
          { error: `시트 접근 불가: 시트가 비공개 상태입니다. 시트 공유 설정에서 "링크가 있는 모든 사용자"로 변경하거나, 로그아웃 후 재로그인하세요.` },
          { status: sheetsResponse.status }
        )
      }
    }

    // Strategy 2: Provider Token (private sheets via user OAuth)
    if (providerToken) {
      console.log('[api/sheets] Attempting with provider token, range=', resolvedRange)
      const sheetsResponse = await fetch(sheetsUrl, {
        headers: {
          Authorization: `Bearer ${providerToken}`,
        },
      })

      if (sheetsResponse.ok) {
        const result = await sheetsResponse.json()
        return Response.json({ values: result.values || [] })
      }

      const errorData = await sheetsResponse.json().catch(() => ({}))
      const msg = errorData?.error?.message || sheetsResponse.statusText
      console.error('[api/sheets] Provider token failed:', msg)
      return Response.json(
        { error: msg },
        { status: sheetsResponse.status }
      )
    }

    // Neither method available
    return Response.json(
      { error: 'Google 인증 수단이 없습니다. 로그아웃 후 다시 로그인하거나, 관리자에게 API Key 설정을 요청하세요.' },
      { status: 401 }
    )
  } catch (error) {
    console.error('[api/sheets] Error:', error)
    return Response.json(
      { error: `서버 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
