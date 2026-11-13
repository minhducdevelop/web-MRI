import type { ReportDraftFields } from '@/types/reportDraft'

/**
 * ============================================================================================
 * GIẢ ĐỊNH VÀ KHOẢNG HỞ KIẾN TRÚC — ĐỌC TRƯỚC KHI DÙNG FILE NÀY
 * ============================================================================================
 *
 * Nhiệm vụ yêu cầu: 3 nút hành động ở AI Panel phải CHÉP nội dung nháp sang form báo cáo
 * chính của RIS (`ReportModal`). AI Panel chạy BÊN TRONG OHIF; OHIF và RIS là hai app, hai
 * origin khác nhau trong triển khai hiện tại (`deploy/compose/docker-compose.full.yml`:
 * ris-frontend ở cổng 8080, ohif-viewer ở cổng 8043) — KHÔNG có chung store trong trình duyệt
 * (không dùng được localStorage/BroadcastChannel vì đó chỉ hoạt động cùng origin).
 *
 * Cơ chế khả dĩ nhất giữa hai tab là `postMessage` qua `window.opener` — NHƯNG đã kiểm tra
 * code RIS thật (`Frontend/src/features/studies/api/viewerApi.ts`):
 *
 *     window.open(data.viewer_url, '_blank', 'noopener,noreferrer')
 *
 * `noopener` (và `noreferrer`, vì theo đặc tả HTML, `noreferrer` cũng ép `noopener=true`) khiến
 * tab OHIF KHÔNG có `window.opener` — nghĩa là OHIF không có cách nào gọi `postMessage` ngược
 * về đúng tab RIS đã mở nó. Đây là lựa chọn bảo mật CÓ CHỦ ĐÍCH của RIS (chặn tab OHIF — nơi có
 * thể hiển thị nội dung AI sinh ra — điều khiển ngược lại tab RIS), không phải thiếu sót.
 *
 * File này KHÔNG tự ý đổi code RIS để "mở khoá" `window.opener` — đó là đổi một quyết định bảo
 * mật đã triển khai (IN-19/IN-23, "đã cài đặt code theo thiết kế"), ngoài phạm vi của nhiệm vụ
 * này (component độc lập), và đổi đánh đổi bảo mật (tab-nabbing) cần nhóm RIS xác nhận, không
 * phải quyết định tự ý ở đây.
 *
 * Vì vậy, `RisBridge` dưới đây implement theo đúng tinh thần "KHÔNG tự ý giả định có chung
 * store" của nhiệm vụ: nó CỐ GẮNG dùng `window.opener.postMessage` (sẽ chạy đúng NẾU/KHI RIS đổi
 * cờ `window.open`, hoặc nếu OHIF được nhúng qua `<iframe>` thay vì tab mới — một hướng khác
 * chưa được chọn), và khi không có `window.opener` (đúng tình trạng THẬT hôm nay), nó rơi về một
 * fallback rõ ràng là tạm (chép nội dung vào clipboard + thông báo cho bác sĩ) thay vì âm thầm
 * không làm gì hoặc giả vờ đã gửi thành công.
 *
 * BA HƯỚNG XỬ LÝ THẬT — cần nhóm chọn, KHÔNG quyết định thay ở đây:
 *   (a) RIS đổi `window.open(..., 'noopener,noreferrer')` → bỏ `noopener`/`noreferrer`, đổi lại
 *       là chấp nhận rủi ro tab-nabbing từ tab OHIF.
 *   (b) Thêm endpoint RIS backend để AI Panel POST nội dung nháp theo `study_instance_uid`, RIS
 *       (`ReportModal`) GET lại khi mở — đụng `doc/api/openapi.yaml`, chính doc/11-ai-design.md
 *       mục 11 đã ghi nhận khoảng hở này và nói rõ "việc sửa api/openapi.yaml thuộc người phụ
 *       trách file đó, không sửa trong lần này" — file này tuân theo đúng ranh giới đó.
 *   (c) Nhúng OHIF trong `<iframe>` của RIS thay vì mở tab mới — đổi kiến trúc deep-link hiện
 *       tại (IN-19/IN-23 đã làm theo hướng tab mới), cũng ngoài phạm vi ở đây.
 * ============================================================================================
 */

export type RisActionKind = 'USE_AS_IS' | 'EDIT_BEFORE_USE' | 'DISMISS'

export interface AiDraftHandoff {
  study_instance_uid: string
  action: RisActionKind
  /** `null` khi `action = DISMISS` — mở form báo cáo trống, không tham chiếu nháp AI nào. */
  draft: ReportDraftFields | null
  source_finding_label: string | null
  model_name: string
  model_version: string
}

export type AiAuditAction =
  | 'AI_SUGGESTION_VIEWED'
  | 'AI_SUGGESTION_ACCEPTED'
  | 'AI_SUGGESTION_EDITED'
  | 'AI_SUGGESTION_REJECTED'

export interface AiAuditDetail {
  study_instance_uid: string
  model_name?: string
  model_version?: string
}

export type RisBridgeChannel = 'postMessage' | 'clipboard-fallback' | 'none'

export interface RisBridgeResult {
  delivered: boolean
  channel: RisBridgeChannel
  message: string
}

export interface RisBridge {
  /** Chép nội dung nháp sang `ReportModal` của RIS (ba nút hành động ở mục 5.2.5.d). */
  sendDraftToReportForm(payload: AiDraftHandoff): Promise<RisBridgeResult>
  /**
   * Ghi audit_log phía RIS (doc/11-ai-design.md mục 6.1). KHÔNG bịa endpoint — AI Panel (chạy
   * trong OHIF, không có session/JWT của bác sĩ) không thể tự gọi API RIS có xác thực; hàm này
   * chỉ CHUYỂN TIẾP event qua cùng cơ chế với `sendDraftToReportForm`, để phía RIS (đang có
   * session bác sĩ) tự gọi API audit thật của nó. Khi không chuyển tiếp được, chỉ log ra
   * console kèm TODO — không throw, không chặn luồng UI.
   *
   * Trả về `RisBridgeResult` (cùng hình dạng với `sendDraftToReportForm`) để UI biết CHẮC là
   * event đã chuyển tiếp được hay chưa, thay vì âm thầm coi như đã ghi — bác sĩ cần thấy rõ nếu
   * hành động của mình KHÔNG vào được audit log.
   */
  logAiAction(action: AiAuditAction, detail: AiAuditDetail): RisBridgeResult
}

const RIS_MESSAGE_TYPE = 'vr-ris-pacs/ai-panel-draft-handoff'
const RIS_AUDIT_MESSAGE_TYPE = 'vr-ris-pacs/ai-panel-audit'

/**
 * Implementation duy nhất hôm nay — xem ghi chú đầu file về giới hạn `window.opener`.
 * `risOrigin` dùng để giới hạn `targetOrigin` của `postMessage` (không gửi cho "*") — truyền
 * đúng origin RIS (ví dụ `http://localhost:8080`), không hardcode trong file này.
 */
export function createWindowOpenerRisBridge(risOrigin: string): RisBridge {
  function tryPostMessage(type: string, payload: unknown): boolean {
    if (typeof window === 'undefined' || !window.opener) return false
    try {
      window.opener.postMessage({ type, payload }, risOrigin)
      return true
    } catch (err) {
      console.error('RisBridge: postMessage tới RIS thất bại', err)
      return false
    }
  }

  return {
    async sendDraftToReportForm(payload) {
      if (tryPostMessage(RIS_MESSAGE_TYPE, payload)) {
        return { delivered: true, channel: 'postMessage', message: 'Đã gửi nội dung sang tab RIS.' }
      }

      // Fallback TẠM (xem ghi chú đầu file): không có window.opener hôm nay vì RIS mở OHIF với
      // "noopener,noreferrer". Chép nội dung ra clipboard để bác sĩ tự dán — không giả vờ đã
      // gửi thành công.
      const text = formatDraftForClipboard(payload)
      const copied = await copyToClipboard(text)
      return {
        delivered: false,
        channel: copied ? 'clipboard-fallback' : 'none',
        message: copied
          ? 'Không tự chuyển được sang RIS (xem integration/risBridge.ts). Đã chép nội dung nháp — mở tab RIS và dán vào đúng ô trong "Báo cáo kết quả".'
          : 'Không tự chuyển được sang RIS và cũng không chép được vào clipboard. Vui lòng mở lại nội dung gợi ý trong AI Panel và nhập tay vào "Báo cáo kết quả".',
      }
    },

    logAiAction(action, detail) {
      const delivered = tryPostMessage(RIS_AUDIT_MESSAGE_TYPE, { action, ...detail })
      if (!delivered) {
        // TODO(H-04 / endpoint audit AI): khi có cơ chế chuyển tiếp thật (xem 3 hướng đầu file),
        // RIS lắng nghe message này và tự gọi API audit_log của nó bằng session bác sĩ hiện tại.
        console.debug('[AI Panel audit — stub, chưa chuyển tiếp được tới RIS]', action, detail)
      }
      return {
        delivered,
        channel: delivered ? 'postMessage' : 'none',
        message: delivered
          ? 'Đã ghi nhận vào audit log.'
          : 'KHÔNG tự ghi được vào audit log (chưa chuyển tiếp được sang tab RIS — xem integration/risBridge.ts). Hành động mới chỉ hiện trong phiên AI Panel này.',
      }
    },
  }
}

function formatDraftForClipboard(payload: AiDraftHandoff): string {
  if (payload.action === 'DISMISS' || !payload.draft) {
    return 'Bác sĩ đã bấm "Bỏ qua gợi ý" — không có nội dung nháp để dán.'
  }
  const d = payload.draft
  return [
    `Kỹ thuật: ${d.technique}`,
    `Mô tả: ${d.findings}`,
    `Chẩn đoán: ${d.diagnosis}`,
    `Kết luận: ${d.conclusion}`,
    `Khuyến nghị: ${d.recommendation}`,
  ].join('\n')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
