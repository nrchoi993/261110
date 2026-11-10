export const MODEL = 'gpt-6-luna'
const RESPONSES_URL = 'https://api.openai.com/v1/responses'

function apiErrorMessage(status, error = {}) {
  const quotaCodes = [
    'insufficient_quota',
    'billing_hard_limit_reached',
    'credit_balance_exhausted',
    'organization_spend_limit_exceeded',
    'project_spend_limit_exceeded',
    'organization_usage_limit_exceeded',
  ]
  if (quotaCodes.includes(error.code) || error.type === 'insufficient_quota') {
    return 'API 사용 잔액이나 프로젝트 및 조직의 사용 한도가 부족합니다. OpenAI API의 결제 및 한도 설정을 확인해 주세요.'
  }
  if (error.code === 'context_length_exceeded') {
    return '대화가 모델이 처리할 수 있는 길이를 넘었습니다. 대화를 초기화하거나 질문을 짧게 나누어 주세요.'
  }
  if (status === 401) {
    return 'API 키가 올바르지 않거나 만료되었습니다. .env.local의 키를 확인한 뒤 개발 서버를 재시작해 주세요.'
  }
  if (status === 403) {
    return '이 키로 요청할 권한이 없습니다. OpenAI 프로젝트의 API 권한, 모델 접근 권한 및 지원 지역을 확인해 주세요.'
  }
  if (status === 404) {
    return `요청한 모델(${MODEL})을 사용할 수 없습니다. 계정의 모델 접근 권한을 확인해 주세요.`
  }
  if (status === 429) {
    return '요청이 너무 많아 잠시 제한되었습니다. 잠시 기다린 뒤 다시 전송해 주세요.'
  }
  if (status === 408 || status === 504) {
    return 'API 응답 시간이 초과되었습니다. 잠시 후 다시 전송해 주세요.'
  }
  if (status >= 500) {
    return 'OpenAI 서버에 일시적인 문제가 있습니다. 잠시 후 다시 전송해 주세요.'
  }
  if (status === 400) {
    return 'API가 요청 내용을 처리하지 못했습니다. 입력 길이와 요청 형식을 확인해 주세요.'
  }
  return `API 요청에 실패했습니다(HTTP ${status}). 키와 네트워크 상태를 확인한 뒤 다시 시도해 주세요.`
}

export async function createResponse({ apiKey, input, signal }) {
  if (!apiKey?.trim()) {
    throw new Error('API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 설정해 주세요.')
  }

  let response
  try {
    response = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning: { effort: 'none' },
        instructions: '당신은 친절하고 정확한 대화 도우미입니다. 사용자의 언어로 명확하게 답하고, 이전 대화의 맥락을 참고하세요.',
        input,
        max_output_tokens: 2048,
        store: false,
      }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted || error.name === 'AbortError') throw error
    throw new Error('API에 연결하지 못했습니다. 인터넷 연결을 확인하고, 브라우저 개발자 도구에서 네트워크 또는 CORS 차단 여부를 확인해 주세요.')
  }

  // 오류 응답이 HTML 또는 빈 본문이어도 HTTP 상태에 맞는 안내를 제공합니다.
  let data
  try {
    data = await response.json()
  } catch {
    if (!response.ok) throw new Error(apiErrorMessage(response.status))
    throw new Error('API 응답을 JSON으로 읽지 못했습니다. 잠시 후 다시 전송해 주세요.')
  }

  if (!response.ok) throw new Error(apiErrorMessage(response.status, data?.error ?? {}))
  if (data?.error || data?.status === 'failed') {
    throw new Error('OpenAI가 답변을 생성하지 못했습니다. 잠시 후 다시 전송해 주세요.')
  }
  if (data?.status === 'incomplete') {
    throw new Error(data.incomplete_details?.reason === 'max_output_tokens'
      ? '답변이 출력 한도에 도달했습니다. 질문을 짧게 나누어 다시 전송해 주세요.'
      : '답변 생성이 완료되지 않았습니다. 질문을 바꾸어 다시 전송해 주세요.')
  }
  if (data?.status !== 'completed' || !Array.isArray(data.output)) {
    throw new Error('완료된 API 응답을 받지 못했습니다. 잠시 후 다시 전송해 주세요.')
  }

  // REST JSON에는 SDK의 편의 속성인 output_text가 없으므로 output을 순회합니다.
  // 첫 항목이 답변이라는 가정을 하지 않으며 거절 응답도 화면에 표시합니다.
  const text = data.output
    .filter((item) => item.type === 'message' && item.role === 'assistant')
    .flatMap((item) => item.content ?? [])
    .map((part) => part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : '')
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n\n')

  if (!text.trim()) throw new Error('API 응답에 표시할 텍스트가 없습니다. 질문을 바꾸어 다시 전송해 주세요.')

  return { text, output: data.output }
}
