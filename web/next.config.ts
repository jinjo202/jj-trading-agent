import path from 'node:path'
import type { NextConfig } from 'next'

// 저장소 최상위와 web/ 양쪽에 package-lock.json이 있어서 Next가 workspace root를
// 최상위로 추론한다. 그대로 두면 빌드마다 경고가 나고, 배포 환경에서 파일 트레이싱
// 범위가 의도와 달라질 수 있다. 이 앱의 루트는 web/ 이므로 명시한다.
const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(import.meta.dirname, '.'),
}

export default nextConfig
