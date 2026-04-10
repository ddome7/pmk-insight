import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  console.log('[auth/callback] code present:', !!code)

  if (code) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const isLocalEnv = process.env.NODE_ENV === 'development'

    // In production on Vercel, use x-forwarded-host to handle the correct domain
    let redirectBase: string
    if (isLocalEnv) {
      redirectBase = origin
    } else if (forwardedHost) {
      redirectBase = `https://${forwardedHost}`
    } else {
      redirectBase = origin
    }

    const redirectUrl = `${redirectBase}${next}`
    console.log('[auth/callback] redirectUrl:', redirectUrl)

    const response = NextResponse.redirect(redirectUrl)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Set on the request object so downstream middleware can read them
              request.cookies.set(name, value)
              // Set on the response so the browser stores them
              response.cookies.set(name, value, options)
            })
            console.log('[auth/callback] cookies set:', cookiesToSet.map(c => c.name))
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    console.log('[auth/callback] exchangeCodeForSession error:', error?.message ?? 'none')

    if (!error) {
      // Verify the session was properly established
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[auth/callback] user after exchange:', user?.email ?? 'null')
      return response
    }
  }

  console.log('[auth/callback] falling through to error redirect')
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
