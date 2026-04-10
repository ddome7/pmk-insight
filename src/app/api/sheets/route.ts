// TODO: Vercel 환경변수 설정 필요
// - GOOGLE_CLIENT_ID: Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 ID
// - GOOGLE_CLIENT_SECRET: Google Cloud Console에서 발급한 OAuth 2.0 클라이언트 시크릿

import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { spreadsheetId } = await request.json()

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return Response.json(
        { error: '유효한 spreadsheetId가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return Response.json(
        { error: '인증되지 않은 요청입니다. 로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    let accessToken = session.provider_token

    // provider_token이 없으면 refresh_token으로 새 access token 발급
    if (!accessToken) {
      const refreshToken = session.provider_refresh_token

      if (!refreshToken) {
        return Response.json(
          { error: 'Google 인증 토큰이 만료되었습니다. 로그아웃 후 다시 로그인해주세요.' },
          { status: 401 }
        )
      }

      const clientId = process.env.GOOGLE_CLIENT_ID
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        console.error('[api/sheets] GOOGLE_CLIENT_ID 또는 GOOGLE_CLIENT_SECRET 환경변수가 설정되지 않았습니다.')
        return Response.json(
          { error: '서버 설정 오류입니다. 관리자에게 문의하세요.' },
          { status: 500 }
        )
      }

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json().catch(() => ({}))
        console.error('[api/sheets] Token refresh failed:', errorData)
        return Response.json(
          { error: 'Google 토큰 갱신에 실패했습니다. 로그아웃 후 다시 로그인해주세요.' },
          { status: 401 }
        )
      }

      const tokenData = await tokenResponse.json()
      accessToken = tokenData.access_token
    }

    // Google Sheets API 호출
    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z200`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!sheetsResponse.ok) {
      const errorData = await sheetsResponse.json().catch(() => ({}))
      const msg = errorData?.error?.message || sheetsResponse.statusText
      console.error('[api/sheets] Sheets API error:', msg)
      return Response.json(
        { error: `시트 데이터를 가져올 수 없습니다: ${msg}` },
        { status: sheetsResponse.status }
      )
    }

    const result = await sheetsResponse.json()
    const values: string[][] = result.values || []

    return Response.json({ values })
  } catch (error) {
    console.error('[api/sheets] Error:', error)
    return Response.json(
      { error: `서버 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
