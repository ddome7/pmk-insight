import { createClient } from '@/lib/supabase/server'

// GET: 현재 유저의 에이전트 조회
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { data } = await supabase
      .from('manager_agents')
      .select('*')
      .eq('user_id', user.id)
      .single()

    return Response.json({ agent: data || null })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// PUT: 에이전트 페르소나 업데이트
export async function PUT(request: Request) {
  try {
    const { persona, manager_name } = await request.json()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { data, error } = await supabase
      .from('manager_agents')
      .upsert({
        user_id: user.id,
        manager_name: manager_name || '매니저',
        persona: persona || '',
      }, { onConflict: 'user_id,manager_name' })
      .select()
      .single()

    if (error) throw error
    return Response.json({ agent: data })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
