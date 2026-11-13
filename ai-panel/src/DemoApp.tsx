import { useMemo, useState } from 'react'
import { AiPanel } from './components/AiPanel'
import { MockAiClient, DEMO_STUDY_UIDS } from './services/mockAiClient'
import { createWindowOpenerRisBridge, type RisBridge } from './integration/risBridge'

/**
 * Khung minh hoạ 5 trạng thái NGOÀI OHIF thật (vì gói này là component độc lập — xem
 * README.md). Chỉ dùng để chạy `npm run dev` xem trước AI Panel; không phải một phần giao nộp
 * vào OHIF. Bộ chọn trạng thái ở cột phải thay cho `state-switch` trong mockup gốc, nhưng ở đây
 * đi qua đúng `AiService`/`MockAiClient` thật (không hardcode HTML template như mockup tĩnh).
 */
const CASES: { key: keyof typeof DEMO_STUDY_UIDS; label: string }[] = [
  { key: 'NOT_TRIGGERED', label: '1. Chưa xử lý' },
  { key: 'PENDING', label: '2. Đang phân tích' },
  { key: 'READY', label: '3. Có gợi ý AI' },
  { key: 'FAILED', label: '4. AI lỗi' },
  { key: 'TIMEOUT', label: '5. Không phản hồi' },
]

export function DemoApp() {
  const [caseKey, setCaseKey] = useState<keyof typeof DEMO_STUDY_UIDS>('NOT_TRIGGERED')
  const [previouslyReviewed, setPreviouslyReviewed] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const aiService = useMemo(() => new MockAiClient(), [])

  // Bọc RisBridge thật để hiện lại kết quả handoff/audit ra "Nhật ký tích hợp" bên dưới — minh
  // hoạ đúng hành vi thật (thử postMessage → window.opener null trong demo này → rơi về
  // clipboard fallback, xem integration/risBridge.ts) mà không cần một tab RIS thật.
  const risBridge: RisBridge = useMemo(() => {
    const base = createWindowOpenerRisBridge(window.location.origin)
    return {
      async sendDraftToReportForm(payload) {
        const result = await base.sendDraftToReportForm(payload)
        setLog(l => [...l, `[handoff] action=${payload.action} channel=${result.channel} → ${result.message}`])
        return result
      },
      logAiAction(action, detail) {
        const result = base.logAiAction(action, detail)
        setLog(l => [...l, `[audit] ${action} study_instance_uid=${detail.study_instance_uid} channel=${result.channel} → ${result.message}`])
        return result
      },
    }
  }, [])

  const studyInstanceUid = DEMO_STUDY_UIDS[caseKey]

  return (
    <div className="demo-shell">
      <div className="demo-main">
        <div className="hint">
          Khung xem ảnh và thanh công cụ OHIF thật KHÔNG thuộc phạm vi code của nhiệm vụ này
          (doc/11-ai-design.md mục 5 — "không vẽ lại viewer OHIF"). Vùng này chỉ để lấy chỗ nhìn
          AI Panel tách biệt khỏi khung tối của toàn trang, giống vùng viewport thật.
        </div>
      </div>
      <div className="demo-side">
        <div className="demo-switch">
          <span className="lbl">Demo trạng thái (chỉ để xem trước — không phải UI thật)</span>
          {CASES.map(c => (
            <button key={c.key} className={c.key === caseKey ? 'active' : ''} onClick={() => setCaseKey(c.key)}>
              {c.label}
            </button>
          ))}
          <label>
            <input
              type="checkbox"
              checked={previouslyReviewed}
              onChange={e => setPreviouslyReviewed(e.target.checked)}
            />
            Giả lập T9 (ca đã đọc trước — chỉ áp dụng cho "Có gợi ý AI")
          </label>
        </div>

        <AiPanel
          studyInstanceUid={studyInstanceUid}
          aiService={aiService}
          risBridge={risBridge}
          previouslyReviewed={caseKey === 'READY' && previouslyReviewed}
        />

        <div className="demo-log">
          <div className="lbl">Nhật ký tích hợp (handoff + audit)</div>
          {log.length === 0 ? '— chưa có hành động nào —' : log.join('\n')}
        </div>
      </div>
    </div>
  )
}
