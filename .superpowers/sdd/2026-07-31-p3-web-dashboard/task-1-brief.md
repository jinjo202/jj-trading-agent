### Task 1: Next.js 스캐폴드 + Supabase 클라이언트 + 레이아웃

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/postcss.config.mjs`
- Create: `web/app/layout.tsx`, `web/app/globals.css`
- Create: `web/lib/supabase.ts`
- Create: `web/components/Disclaimer.tsx`
- Create: `web/.env.local.example`
- Modify: `.gitignore` (루트, `web/.env.local.example` 예외 추가)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `web/lib/supabase.ts`: `supabase: SupabaseClient` (모듈 싱글턴), `components/Disclaimer.tsx`: `export function Disclaimer(): JSX.Element`

- [ ] **Step 1: 디렉터리 확인 후 패키지 파일 생성**

```bash
ls "web" 2>/dev/null || echo "web/ 없음 — 새로 만든다"
```

`web/package.json`:

```json
{
  "name": "trading-agent-web",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test lib/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.2.12",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "@supabase/supabase-js": "^2.111.0",
    "recharts": "^3.10.1"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.3.3",
    "@tailwindcss/postcss": "^4.3.3"
  }
}
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`web/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`web/postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

`web/.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=https://jsxhcqnupvvctnjiaric.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`.gitignore`(루트) 끝에 한 줄 추가 — `web/`도 자체 `node_modules`/`.next`/`.env.local`을 갖는데
기존 패턴(`node_modules/`, `.next/`, `.env*`)이 경로 깊이와 무관하게 이미 다 잡아준다.
`web/.env.local.example`만 예외 처리한다:

```
!web/.env.local.example
```

- [ ] **Step 2: 의존성 설치**

```bash
cd web && npm install && cd ..
```

- [ ] **Step 3: Supabase 클라이언트**

`web/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다')
}

// anon 키만 쓴다. service_role은 이 파일에도, web/ 어디에도 존재하지 않는다.
export const supabase = createClient(url, key)
```

- [ ] **Step 4: 디스클레이머 컴포넌트 + 전역 레이아웃**

`web/components/Disclaimer.tsx`:

```tsx
export function Disclaimer() {
  return (
    <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
      이 페이지는 공개 데이터를 정리·해석한 리서치 자료이며 투자자문이 아닙니다.
      작성자는 라이선스를 가진 투자자문업자가 아니며, 어떤 수익도 보장하지 않습니다.
      투자 판단과 그 결과에 대한 책임은 전적으로 투자자 본인에게 있습니다.
    </div>
  )
}
```

`web/app/globals.css`:

```css
@import 'tailwindcss';
```

`web/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Disclaimer } from '@/components/Disclaimer'
import './globals.css'

export const metadata: Metadata = {
  title: '오늘의 시장 판단',
  description: '한국·미국 시장 리서치 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <Disclaimer />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: 빌드 확인**

```bash
cd web && npm run typecheck && cd ..
```

Expected: 에러 없음 (아직 `app/page.tsx`가 없어 `next build`는 실패하지만 typecheck는 통과해야 한다)

- [ ] **Step 6: 커밋**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/next.config.ts web/postcss.config.mjs web/app/layout.tsx web/app/globals.css web/lib/supabase.ts web/components/Disclaimer.tsx web/.env.local.example .gitignore
git commit -m "feat: scaffold Next.js dashboard with anon-only Supabase client"
```

---

