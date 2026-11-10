import './style.css'
import { MODEL, createResponse } from './openai.js'

// VITE_ 변수는 브라우저에 노출됩니다. 이 앱은 로컬 교육용입니다.
const apiKey = (import.meta.env.VITE_OPENAI_API_KEY ?? '').trim()
const form = document.querySelector('#chat-form')
const input = document.querySelector('#message-input')
const sendButton = document.querySelector('#send-button')
const sendLabel = document.querySelector('#send-label')
const resetButton = document.querySelector('#reset-button')
const status = document.querySelector('#api-status')
const conversation = document.querySelector('#conversation')
const messages = document.querySelector('#messages')
const emptyState = document.querySelector('#empty-state')
const requestError = document.querySelector('#request-error')
const errorMessage = document.querySelector('#error-message')
const messageTemplate = document.querySelector('#message-template')
const loadingTemplate = document.querySelector('#loading-template')

// 성공한 요청의 입력과 원본 output을 순서대로 보관하고 다음 요청에 전달합니다.
// 새로고침 또는 대화 초기화 시 비워지며 브라우저 저장소에는 저장하지 않습니다.
let history = []
let activeRequest = null

function setStatus(state, label) {
  status.dataset.state = state
  status.textContent = label
}

function setInitialStatus() {
  setStatus(apiKey ? 'unverified' : 'unconfigured', apiKey ? '연결 미확인' : '키 미설정')
}

function updateControls() {
  const busy = activeRequest !== null
  input.disabled = busy
  sendButton.disabled = busy || !apiKey || !input.value.trim()
  sendLabel.textContent = busy ? '응답 대기' : '전송'
  form.setAttribute('aria-busy', String(busy))
  resetButton.disabled = messages.childElementCount === 0
  document.querySelector('#message-count').textContent = `${messages.querySelectorAll('.message:not(.loading-message)').length}개 메시지`
  emptyState.hidden = messages.childElementCount > 0
}

function scrollToLatest() {
  conversation.scrollTop = conversation.scrollHeight
}

function appendMessage(role, text) {
  const message = messageTemplate.content.firstElementChild.cloneNode(true)
  const isUser = role === 'user'
  message.classList.add(`message--${role}`)
  message.querySelector('.message-avatar').textContent = isUser ? '나' : 'r.'
  message.querySelector('.message-author').textContent = isUser ? '나' : 'Responses'
  // 사용자 입력과 API 응답은 HTML로 실행하지 않고 일반 텍스트로 표시합니다.
  message.querySelector('.message-content').textContent = text
  messages.append(message)
  return message
}

function showError(message) {
  errorMessage.textContent = message
  requestError.hidden = false
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (activeRequest) return

  const text = input.value.trim()
  if (!text) return
  if (!apiKey) {
    showError('API 키가 없습니다. .env.local에 VITE_OPENAI_API_KEY를 입력하고 개발 서버를 재시작해 주세요.')
    return
  }

  const request = { controller: new AbortController(), timedOut: false }
  activeRequest = request
  setStatus('pending', '요청 중')
  requestError.hidden = true
  const userItem = { role: 'user', content: text }
  const userMessage = appendMessage('user', text)
  const loadingMessage = loadingTemplate.content.firstElementChild.cloneNode(true)
  messages.append(loadingMessage)
  input.value = ''
  updateControls()
  scrollToLatest()

  const timeout = window.setTimeout(() => {
    request.timedOut = true
    request.controller.abort()
  }, 60000)

  try {
    const response = await createResponse({
      apiKey,
      input: [...history, userItem],
      signal: request.controller.signal,
    })

    // 초기화로 취소한 이전 요청이 새 대화에 반영되지 않도록 합니다.
    if (activeRequest !== request) return
    history.push(userItem, ...response.output)
    appendMessage('assistant', response.text)
    setStatus('success', '요청 성공')
  } catch (error) {
    if (activeRequest !== request) return
    userMessage.remove()
    input.value = text
    setStatus('error', '요청 실패')
    showError(request.timedOut
      ? '60초 동안 응답이 없어 요청을 중단했습니다. 잠시 후 다시 전송해 주세요.'
      : error.message || '알 수 없는 오류가 발생했습니다. 잠시 후 다시 전송해 주세요.')
  } finally {
    window.clearTimeout(timeout)
    loadingMessage.remove()
    if (activeRequest === request) {
      activeRequest = null
      updateControls()
      scrollToLatest()
      input.focus()
    }
  }
})

input.addEventListener('input', updateControls)
input.addEventListener('keydown', (event) => {
  // 한국어 입력기의 조합 확정 Enter는 전송으로 처리하지 않습니다.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    form.requestSubmit()
  }
})

resetButton.addEventListener('click', () => {
  const previousRequest = activeRequest
  activeRequest = null
  previousRequest?.controller.abort()
  history = []
  messages.replaceChildren()
  input.value = ''
  requestError.hidden = true
  errorMessage.textContent = ''
  setInitialStatus()
  updateControls()
  input.focus()
})

document.querySelectorAll('.suggestion').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.textContent.trim()
    updateControls()
    input.focus()
  })
})

document.querySelector('#model-name').textContent = MODEL
document.querySelector('#key-notice').hidden = Boolean(apiKey)
setInitialStatus()
updateControls()
