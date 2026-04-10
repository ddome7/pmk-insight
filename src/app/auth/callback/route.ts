import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // --- Diagnostic logging ---
  const allRequestCookies = request.cookies.getAll()
  console.log('[auth/callback] code present:', !!code)
  console.log('[auth/callback] request cookies:', allRequestCookies.map(c => `${c.name}=${c.value.slice(0, 20)}...`))
  console.log('[auth/callback] has code_verifier:', allRequestCookies.some(c => c.name.includes('code-verifier') || c.name.includes('code_verifier')))

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

    // Create the Supabase client FIRST, then create the redirect response AFTER
    // exchangeCodeForSession so all cookies are properly captured.
    // We collect cookies to set, then apply them to the final response.
    const cookiesToSetOnResponse: { name: string; value: string; options: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            // Buffer cookies — we'll apply them to the response after exchange
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value)
              cookiesToSetOnResponse.push({ name, value, options: options as Record<string, unknown> })
            })
            console.log('[auth/callback] setAll called with cookies:', cookiesToSet.map(c => c.name))
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

      // NOW create the redirect response and apply all buffered cookies
      const response = NextResponse.redirect(redirectUrl)
      cookiesToSetOnResponse.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
      console.log('[auth/callback] final response cookies:', cookiesToSetOnResponse.map(c => c.name))
      console.log('[auth/callback] redirecting to:', redirectUrl)
      return response
    } else {
      console.log('[auth/callback] exchange failed:', error.message, error.status)
    }
  }

  console.log('[auth/callback] falling through to error redirect')
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
