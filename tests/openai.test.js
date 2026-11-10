import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { MODEL, createResponse } from '../src/openai.js'

const input = [{ role: 'user', content: '안녕하세요' }]
const apiKey = 'test-only-placeholder'
const message = (text) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }],
})
const completed = (output = [message('안녕하세요!')]) => ({ status: 'completed', output })

afterEach(() => mock.restoreAll())

test('Responses REST 요청은 이전 대화를 순서대로 보내고 원본 output을 반환한다', async () => {
  const previousOutput = message('앞선 답변')
  const history = [input[0], previousOutput, { role: 'user', content: '이어서 알려줘' }]
  const original = structuredClone(history)
  const output = [message('이어지는 답변')]
  const controller = new AbortController()
  const fetchMock = mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, `Bearer ${apiKey}`)
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.equal(options.signal, controller.signal)
    const body = JSON.parse(options.body)
    assert.equal(body.model, MODEL)
    assert.deepEqual(body.reasoning, { effort: 'none' })
    assert.equal(body.store, false)
    assert.deepEqual(body.input, history)
    return Response.json(completed(output))
  })

  const result = await createResponse({ apiKey, input: history, signal: controller.signal })
  assert.equal(result.text, '이어지는 답변')
  assert.deepEqual(result.output, output)
  assert.deepEqual(history, original)
  assert.equal(fetchMock.mock.callCount(), 1)
})

test('첫 output이 메시지가 아니어도 모든 답변 텍스트를 추출한다', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json(completed([
    { type: 'reasoning', summary: [] },
    message('첫 번째 부분'),
    message('두 번째 부분'),
  ])))
  const result = await createResponse({ apiKey, input })
  assert.equal(result.text, '첫 번째 부분\n\n두 번째 부분')
})

test('모델의 거절 응답도 일반 텍스트로 반환한다', async () => {
  const refusal = { ...message(''), content: [{ type: 'refusal', refusal: '이 요청은 도와드릴 수 없습니다.' }] }
  mock.method(globalThis, 'fetch', async () => Response.json(completed([refusal])))
  assert.match((await createResponse({ apiKey, input })).text, /도와드릴 수 없습니다/)
})

for (const [status, code, expected] of [
  [401, 'invalid_api_key', /키가 올바르지/],
  [403, null, /권한이 없습니다/],
  [404, 'model_not_found', /모델.*사용할 수 없습니다/],
  [429, 'rate_limit_exceeded', /요청이 너무 많아/],
  [429, 'insufficient_quota', /잔액이나 프로젝트 및 조직의 사용 한도/],
  [429, 'credit_balance_exhausted', /잔액이나 프로젝트 및 조직의 사용 한도/],
  [429, 'organization_spend_limit_exceeded', /결제 및 한도 설정/],
  [429, 'project_spend_limit_exceeded', /결제 및 한도 설정/],
  [429, 'organization_usage_limit_exceeded', /결제 및 한도 설정/],
  [400, 'context_length_exceeded', /대화를 초기화/],
  [400, null, /입력 길이와 요청 형식/],
  [503, null, /서버에 일시적인 문제/],
]) {
  test(`HTTP ${status}, code ${code}를 이해하기 쉬운 오류로 안내한다`, async () => {
    mock.method(globalThis, 'fetch', async () => Response.json({ error: { code } }, { status }))
    await assert.rejects(createResponse({ apiKey, input }), expected)
  })
}

test('JSON이 아닌 서버 오류에도 HTTP 상태를 사용한다', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('<html>Unavailable</html>', { status: 502 }))
  await assert.rejects(createResponse({ apiKey, input }), /서버에 일시적인 문제/)
})

test('성공 HTTP 응답의 잘못된 JSON을 성공으로 처리하지 않는다', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('not json'))
  await assert.rejects(createResponse({ apiKey, input }), /JSON으로 읽지 못했습니다/)
})

test('출력 한도로 중단된 응답을 완료된 답변으로 처리하지 않는다', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({
    status: 'incomplete',
    incomplete_details: { reason: 'max_output_tokens' },
    output: [message('중간에 끊긴 답변')],
  }))
  await assert.rejects(createResponse({ apiKey, input }), /출력 한도/)
})

test('텍스트가 없는 응답을 성공으로 처리하지 않는다', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json(completed([])))
  await assert.rejects(createResponse({ apiKey, input }), /표시할 텍스트가 없습니다/)
})

test('네트워크 연결 오류를 안내한다', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(createResponse({ apiKey, input }), /인터넷 연결/)
})

test('취소 신호를 일반 네트워크 오류로 바꾸지 않는다', async () => {
  const controller = new AbortController()
  controller.abort()
  mock.method(globalThis, 'fetch', async () => { throw controller.signal.reason })
  await assert.rejects(createResponse({ apiKey, input, signal: controller.signal }), { name: 'AbortError' })
})

test('키가 없으면 네트워크 요청을 만들지 않는다', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected request') })
  await assert.rejects(createResponse({ apiKey: '  ', input }), /API 키가 없습니다/)
  assert.equal(fetchMock.mock.callCount(), 0)
})
