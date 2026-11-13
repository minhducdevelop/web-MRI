# AI Panel — gói độc lập (demo 5 trạng thái + hợp đồng tích hợp OHIF/RIS)

Hiện thực hoá wireframe `ai-panel-ohif-mockup.html` thành component React theo đúng mô tả ở
`doc/11-ai-design.md` mục 5 (repo RIS, đường dẫn tương đối `../doc/11-ai-design.md` từ đây).

**Vì sao là một package riêng, không nằm trong `Frontend/`:** AI Panel chạy **bên trong OHIF**,
không phải trong RIS ("RIS không có màn hình nào của AI" — doc/11 mục 5.2 ghi chú, mục 1.1).
Repo này **không vendor mã nguồn OHIF** (chỉ chạy qua Docker image có sẵn, cấu hình qua
`deploy/docker/ohif-app-config.js`) — thêm một OHIF extension project thật (yarn workspace,
build riêng, Docker image tuỳ biến) là một bổ sung stack lớn, ngoài phạm vi đã chọn cho nhiệm vụ
này. Gói này là **component độc lập + hợp đồng tích hợp rõ ràng** để cắm vào `panelService` của
một OHIF extension thật sau này, không phải chính extension đó.

## Chạy demo 5 trạng thái

```bash
cd ai-panel
npm install
npm run dev      # http://localhost:5174
```

Cột phải có bộ chọn trạng thái (giống `state-switch` của mockup, nhưng đi qua đúng
`AiService`/`MockAiClient` thật — không hardcode HTML template tĩnh). Có thêm checkbox giả lập
T9 ("ca đã đọc trước") cho trạng thái "Có gợi ý AI". Khu "Nhật ký tích hợp" ở dưới panel hiện lại
mọi lần gọi `RisBridge` (handoff nội dung nháp + audit) để thấy được hành vi thật, kể cả khi
chạy ngoài một tab RIS thật.

`npm run build` để kiểm tra biên dịch (đã chạy thử: `tsc -b` xanh, `vite build` ra
`dist/` ~241KB JS + ~10KB CSS).

## Cấu trúc

```
src/
  types/aiAnalysis.ts       Schema AiAnalysis/AiFinding — đúng ai_analysis/ai_finding (doc/11 mục 3.2)
  types/reportDraft.ts      5 trường báo cáo + primaryDraftOf() (xem "Điểm giả định" #3)
  lib/confidence.ts         Ngưỡng confidence → mức (Thấp/TB/Cao) — MỘT chỗ duy nhất
  lib/format.ts             Định dạng ngày giờ
  services/aiService.ts     interface AiService
  services/mockAiClient.ts  MockAiClient (đọc fixtures/*.json) — implementation duy nhất hôm nay
  services/fixtures/*.json  1 fixture mỗi ai_status có lưu trữ (PENDING/READY/FAILED/TIMEOUT);
                            NOT_TRIGGERED = không có fixture nào khớp UID (xem "Điểm giả định" #1)
  integration/risBridge.ts     RisBridge: chép nháp sang RIS + logAiAction() — đọc kỹ comment đầu file
  integration/deepLinkContext.ts  Đọc StudyInstanceUID/cờ T9 từ query string (xem "Điểm giả định" #4)
  hooks/useAiAnalysis.ts    Gọi AiService theo StudyInstanceUID, có refresh thủ công (không auto-poll)
  components/AiPanel.tsx   Container — nhận aiService/risBridge qua props, không tự new
  components/*State.tsx    Sub-component theo từng ai_status
  components/ReadyState/*  4 khối con của trạng thái READY (overlay/gợi ý/cảnh báo/hành động)
  styles/tokens.css         Design token — chép đúng :root của mockup
  styles/ai-panel.css       Style của chính AI Panel (phần giao nộp)
  styles/demo.css           Style khung minh hoạ (DemoApp) — KHÔNG thuộc phần giao nộp
  DemoApp.tsx, main.tsx     Khung chạy demo ngoài OHIF thật
```

## Điểm giả định / TODO — đọc trước khi cắm vào OHIF hoặc AI Backend thật

1. **Kho dữ liệu AI (mục 3.2 doc/11) chưa chốt** — tài liệu còn ❓ giữa "kho riêng của AI
   Backend" (đã chọn ở đây) và DICOM SR. `MockAiClient` giả định phương án kho riêng. Khi H-04
   được làm, chỉ cần viết `HttpAiClient implements AiService` gọi API đọc thật, không đổi UI.
2. **Ngưỡng confidence → mức** (`lib/confidence.ts`: <0.5 Thấp, 0.5–0.8 TB, >0.8 Cao) là ngưỡng
   TẠM, CHƯA hiệu chỉnh/đánh giá (doc/11 mục 1.2, mục 7, mục 12 câu 5 — chính tài liệu cũng ghi
   ❓ chưa chốt). Đặt ở một chỗ duy nhất để đổi không phải sửa rải rác.
3. **`primaryDraftOf()` (`types/reportDraft.ts`)** — schema `ai_finding` gắn 5 trường nháp vào
   TỪNG finding, nhưng form báo cáo chỉ có một bộ 5 ô. Ở đây chọn finding có `confidence` cao
   nhất làm nguồn nháp cho 3 nút hành động. Đổi được nếu nhóm AI Backend thiết kế lại cách gộp
   nháp từ nhiều finding — đây là quyết định của nhóm, không phải điều tài liệu đã chốt.
4. **Cờ T9 `aiPreviouslyReviewed`** (`integration/deepLinkContext.ts`) — đề xuất RIS thêm
   `&aiPreviouslyReviewed=1` vào deep-link (`GET /studies/{id}/viewer-link`, doc/16 mục 3.1)
   khi ca đang ở lượt đọc thứ hai. **Chưa có trong API thật** — cần người phụ trách IN-23 xác
   nhận. Thiếu cờ này, AI Panel coi mọi lần mở là lần đầu (an toàn hơn, không vi phạm nguyên tắc
   chống automation bias — khối gợi ý vẫn phải bấm mới mở).
5. **Khoảng hở lớn nhất — cơ chế chuyển nội dung nháp từ OHIF sang RIS
   (`integration/risBridge.ts`, đọc comment đầu file):** đã kiểm tra code RIS thật
   (`Frontend/src/features/studies/api/viewerApi.ts`) — RIS mở OHIF bằng
   `window.open(url, '_blank', 'noopener,noreferrer')`, nên tab OHIF **không có `window.opener`**
   và không thể `postMessage` ngược về tab RIS đã mở nó. Đây là lựa chọn bảo mật có chủ đích của
   RIS, không phải thiếu sót — file này **không tự ý đổi code RIS** để mở khoá việc đó.
   `RisBridge` hôm nay: thử `window.opener.postMessage` (sẽ chạy đúng nếu RIS đổi cờ, hoặc nếu
   OHIF được nhúng `<iframe>` thay vì tab mới), nếu không có `window.opener` thì rơi về **chép
   nội dung vào clipboard** + thông báo cho bác sĩ tự dán — không giả vờ đã gửi thành công.
   Ba hướng xử lý thật, **cần nhóm chọn**:
   - (a) RIS bỏ `noopener`/`noreferrer` khi mở OHIF — đổi lại là chấp nhận rủi ro tab-nabbing.
   - (b) Thêm endpoint RIS backend để AI Panel POST nháp theo `study_instance_uid`, `ReportModal`
     GET lại khi mở — đụng `doc/api/openapi.yaml`; chính doc/11 mục 11 đã ghi nhận khoảng hở này
     và nói rõ việc sửa `openapi.yaml` **không thuộc phạm vi lần này** — file này tuân theo đúng
     ranh giới đó, không tự thêm endpoint.
   - (c) Nhúng OHIF trong `<iframe>` của RIS thay vì tab mới — đổi kiến trúc deep-link hiện tại
     (IN-19/IN-23 đã làm theo hướng tab mới).
6. **`logAiAction()` không gọi endpoint audit nào** — AI Panel chạy trong OHIF, không có
   session/JWT của bác sĩ, nên không thể tự ghi `audit_log` của RIS. Hàm này chỉ CHUYỂN TIẾP
   event qua cùng cơ chế ở mục 5 (khi chuyển tiếp được, RIS tự gọi API audit thật bằng session
   của nó); khi không chuyển tiếp được, chỉ `console.debug` kèm TODO — đúng yêu cầu nhiệm vụ
   ("không bịa endpoint"). `logAiAction()` giờ **trả về `RisBridgeResult`** (cùng hình dạng với
   `sendDraftToReportForm`) và `ReadyState`/`ActionButtons` hiện nó ra UI (`StatusNote`, màu
   xanh/vàng theo `delivered`) — bác sĩ thấy rõ ngay nếu audit log KHÔNG ghi được, không chỉ
   console.debug âm thầm như trước. Việc này áp dụng cho cả 3 nút hành động và lần đầu mở khối
   "Nhãn AI đề xuất" (`AI_SUGGESTION_VIEWED`).
7. **Mockup gốc không vẽ "Chẩn đoán"/"Khuyến nghị" trong report-box** (chỉ có Kỹ thuật/Mô
   tả/Kết luận) nhưng doc/11 mục 3.2 và yêu cầu nhiệm vụ nói rõ 5 trường — `ReportDraftPreview`
   hiện đủ 5 trường (Kỹ thuật/Mô tả/Chẩn đoán/Kết luận/Khuyến nghị), ưu tiên đúng mô tả văn bản
   của tài liệu hơn hình minh hoạ của mockup ở điểm này.
8. **Loại ảnh AI xử lý và các câu hỏi khác ở doc/11 mục 12** vẫn còn ❓ — không tự chốt thay
   nhóm; fixture dùng tên model `MedAI-ChestCT` chỉ để demo, không phải đề xuất model thật.

## Ranh giới đã tuân thủ (đối chiếu yêu cầu nhiệm vụ)

- Không vẽ lại/fork viewer OHIF, không code phần render ảnh/mask — `OverlaySection` chỉ hiện một
  khung minh hoạ VỊ TRÍ overlay, có ghi chú rõ "OHIF tự vẽ mask DICOM SEG thật ở đây".
- Không có nút "Lưu" trong panel — ba nút hành động chỉ gọi `RisBridge.sendDraftToReportForm`,
  không tự ghi gì. `report.origin` vẫn do backend RIS tính lúc lưu (không đổi gì ở đó).
- AI Panel chỉ đọc qua `AiService` theo `StudyInstanceUID` — không có dòng code nào gọi RIS API
  hay MySQL của RIS để lấy dữ liệu AI.
- `MockAiClient` tách khỏi component (interface `AiService`) — đổi implementation khi H-04 được
  làm không đổi UI.
- Overlay mặc định TẮT; khối gợi ý chẩn đoán không tự bung, phải bấm mở (ghi
  `AI_SUGGESTION_VIEWED` ở lần mở đầu); T9 có banner riêng trước khi lộ nội dung; dùng từ "gợi ý"
  xuyên suốt, không dùng "chẩn đoán AI"/"kết quả AI".
- Tiếng Việt cho mọi label hiển thị, giữ nguyên câu cảnh báo cố định đúng nguyên văn tài liệu.
- Responsive cơ bản (panel là `width: 320px`, không có kích thước cứng ngoài đó phụ thuộc màn
  hình lớn); toggle/slider/nút đều focus được bằng bàn phím (`:focus-visible`); animation
  (spinner, pulse, knob) tôn trọng `prefers-reduced-motion`.
- Không thêm dependency ngoài React — mọi control tự viết bằng CSS thuần (đúng quy ước
  "không dùng thư viện UI ngoài" của `Frontend/README.md`, áp cho cả gói này).
