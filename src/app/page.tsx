import { redirect } from 'next/navigation'

// 루트 경로는 미들웨어가 처리하므로 여기까지 오는 경우는 없음
// 혹시 도달하면 /customers로 보냄
export default function Home() {
  redirect('/customers')
}
