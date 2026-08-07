import { spawn } from 'node:child_process'

/**
 * `claude -p`를 텍스트 in / JSON out 으로만 쓴다.
 *
 * 번들을 프롬프트에 인라인으로 넣기 때문에 모델이 파일·셸 도구를 쓸 일이 없다.
 * 이게 중요한 이유: 헤드리스 실행에서 도구를 쓰면 워크스페이스 신뢰·권한 프롬프트에 걸려
 * 무인 실행이 조용히 멈춘다. 도구를 아예 안 주면 그 경로가 사라진다.
 */
// 기본 10분. CIO 단계는 번들 56KB를 읽고 JSON 10KB를 쓰기 때문에 5분으로는 부족해
// 실측에서 타임아웃이 났다. 데스크는 60-90초에 끝나므로 천장을 높여도 정상 경로에는 영향이 없다.
export async function askClaude(prompt: string, timeoutMs = 600_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      // --tools "" 는 내장 도구를 전부 끈다(CLI 문서 표기). 도구가 없으면
      // 워크스페이스 신뢰·권한 프롬프트 경로 자체가 사라져 무인 실행이 멈추지 않는다.
      ['-p', '--output-format', 'json', '--tools', ''],
      // shell을 쓰지 않는다. Windows 셸을 거치면 빈 문자열 인자가 사라져
      // `--tools` 가 값 없는 플래그로 보이고 CLI가 "argument missing"으로 죽는다.
      // claude는 .exe라 셸 없이 PATH에서 바로 실행된다.
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`claude -p 타임아웃 (${timeoutMs}ms)`))
    }, timeoutMs)

    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      // 종료코드보다 stdout의 JSON을 먼저 본다. claude는 오류일 때도 구조화된 응답을 주는데,
      // 종료코드부터 보고 stderr를 던지면 실제 원인이 묻힌다 —
      // 실측에서 429(세션 한도)가 무해한 워크스페이스 신뢰 경고에 가려졌다.
      let env: { result?: unknown; is_error?: boolean; api_error_status?: number } | null = null
      try {
        env = JSON.parse(out)
      } catch {
        // stdout이 JSON이 아니면 아래에서 종료코드/stderr로 보고한다.
      }
      if (env?.is_error) {
        const status = env.api_error_status
        const msg = `claude -p 오류${status ? ` (HTTP ${status})` : ''}: ${String(env.result).slice(0, 300)}`
        return reject(Object.assign(new Error(msg), { apiErrorStatus: status }))
      }
      if (code !== 0) return reject(new Error(`claude -p 종료코드 ${code}: ${err.slice(0, 400)}`))
      if (typeof env?.result !== 'string') {
        return reject(new Error(`claude -p 응답에 result 문자열이 없습니다: ${out.slice(0, 300)}`))
      }
      resolve(env.result)
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/**
 * 모델이 JSON만 내라는 지시를 받아도 코드펜스나 앞뒤 설명을 붙이는 일이 있다.
 * 첫 `{`부터 마지막 `}`까지 잘라내 파싱한다 — 지시를 어겼다고 실행 전체를 버리는 것보다 낫다.
 */
export function extractJson(text: string): unknown {
  const t = text.trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`응답에서 JSON 객체를 찾지 못했습니다: ${t.slice(0, 200)}`)
  }
  return JSON.parse(t.slice(start, end + 1))
}

/**
 * 검증을 통과할 때까지 재시도한다. 실패하면 **검증기 메시지를 그대로 다시 준다** —
 * "어느 필드가 왜 거부됐는지"가 모델이 고칠 수 있는 유일한 정보다.
 */
export async function askValidated<T>(
  label: string,
  prompt: string,
  validate: (v: unknown) => T,
  attempts = 3,
): Promise<T> {
  let lastErr = ''
  for (let i = 1; i <= attempts; i++) {
    const p = i === 1
      ? prompt
      : `${prompt}\n\n## 직전 시도가 거부됐다\n\n오류: ${lastErr}\n\n이 오류를 고쳐서 JSON 전체를 다시 출력하라. 설명 없이 JSON만.`
    try {
      const raw = await askClaude(p)
      return validate(extractJson(raw))
    } catch (e) {
      // 사용량 한도(429)는 재시도로 풀리지 않는다. 3회를 더 때려도 같은 답이 오고
      // 그 사이 남은 단계까지 실패하므로 즉시 멈춰 로그에 원인을 남긴다.
      const status = (e as { apiErrorStatus?: number }).apiErrorStatus
      if (status === 429) throw new Error(`${label} 중단 — 사용량 한도: ${(e as Error).message}`)
      lastErr = (e as Error).message
      console.error(`  ${label} 시도 ${i}/${attempts} 실패: ${lastErr.slice(0, 300)}`)
      if (i === attempts) throw new Error(`${label} ${attempts}회 실패: ${lastErr}`)
    }
  }
  throw new Error('unreachable')
}
