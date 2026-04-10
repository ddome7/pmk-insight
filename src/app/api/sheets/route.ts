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
 */
export async function POST(request: Request) {
  try {
    const { spreadsheetId, providerToken } = await request.json()

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return Response.json(
        { error: '유효한 spreadsheetId가 필요합니다.' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_API_KEY
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z200`

    // Strategy 1: API Key (public/shared sheets)
    if (apiKey) {
      console.log('[api/sheets] Attempting with API Key')
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
      console.log('[api/sheets] Attempting with provider token')
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
