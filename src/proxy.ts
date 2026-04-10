import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip auth routes BEFORE creating Supabase client to avoid
  // interfering with the callback's cookie exchange.
  // The callback route handler manages its own cookies.
  if (pathname.startsWith('/auth')) {
    console.log('[proxy] skipping auth route:', pathname)
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Use getUser() instead of getSession().
  // getUser() sends a request to the Supabase Auth server every time to revalidate.
  // getSession() only reads from the JWT which can be stale/tampered.
  const { data: { user }, error } = await supabase.auth.getUser()

  console.log(`[proxy] ${pathname} | user: ${user?.email ?? 'null'} | error: ${error?.message ?? 'none'}`)
  console.log(`[proxy] ${pathname} | request cookies:`, request.cookies.getAll().map(c => c.name))

  // If logged in and on login page, redirect to dashboard
  if (pathname.startsWith('/login') && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Allow login page through
  if (pathname.startsWith('/login') || pathname === '/') {
    return supabaseResponse
  }

  // Not logged in -> redirect to login
  if (!user) {
    console.log('[proxy] no user, redirecting to /login from:', pathname)
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: Always return supabaseResponse, not NextResponse.next().
  // supabaseResponse carries the updated cookies from setAll().
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
