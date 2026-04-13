import { createClient } from '@/lib/supabase/server'

// GET: 어드민 여부 확인 + 어드민 목록 + 유저 목록
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    // 내가 어드민인지 확인
    const { data: myAdmin } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const isAdmin = !!myAdmin

    // 어드민 목록
    const { data: adminList } = await supabase
      .from('admins')
      .select('user_id, email, created_at')
      .order('created_at', { ascending: true })

    // 앱 사용 유저 목록 (manager_agents 기반, 이메일은 manager_name에 저장됨)
    const { data: userList } = await supabase
      .from('manager_agents')
      .select('user_id, manager_name, agent_name, created_at')
      .order('created_at', { ascending: true })

    return Response.json({ isAdmin, admins: adminList || [], users: userList || [] })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// POST: 어드민 권한 부여 (어드민만 가능)
export async function POST(request: Request) {
  try {
    const { userId, email } = await request.json()
    if (!userId) return Response.json({ error: 'userId가 필요합니다.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    const { error } = await supabase.from('admins').insert({
      user_id: userId,
      email: email || '',
      granted_by: user.id,
    })

    if (error) throw error
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}

// DELETE: 어드민 권한 회수 (어드민만 가능)
export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json()
    if (!userId) return Response.json({ error: 'userId가 필요합니다.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: '인증이 필요합니다.' }, { status: 401 })

    // 자기 자신의 어드민 권한은 회수 불가
    if (userId === user.id) {
      return Response.json({ error: '자신의 어드민 권한은 회수할 수 없습니다.' }, { status: 400 })
    }

    await supabase.from('admins').delete().eq('user_id', userId)
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 })
  }
}
