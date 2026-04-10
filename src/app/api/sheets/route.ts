export async function POST(request: Request) {
  try {
    const { spreadsheetId, providerToken } = await request.json()

    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return Response.json(
        { error: '유효한 spreadsheetId가 필요합니다.' },
        { status: 400 }
      )
    }

    if (!providerToken) {
      return Response.json(
        { error: 'Google 인증 토큰이 없습니다. 로그아웃 후 다시 로그인해주세요.' },
        { status: 401 }
      )
    }

    const sheetsResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z200`,
      {
        headers: {
          Authorization: `Bearer ${providerToken}`,
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
