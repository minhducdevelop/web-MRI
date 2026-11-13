# VR-RIS PACS — Đặc tả UI × permission theo component

Tài liệu con của `06-rbac-matrix.md` (không thay thế). Mục đích: dev Frontend tra cứu trực tiếp
component nào dùng permission nào, tab/trạng thái mặc định theo vai trò, trường bị khóa theo vai
trò — không phải đọc lại toàn bộ `06-rbac-matrix.md` mỗi lần code.

| Phiên bản | 0.1 (nháp — chưa được nhóm xác nhận) |
|---|---|
| Ngày | 2026-11-08 |
| Nguồn | `06-rbac-matrix.md` mục 6 (bảng đối chiếu `auth.ts`) · `03-state-machine.md` mục 2.5 · `13-user-stories.md` mục 5 (đối chiếu Frontend) · `Frontend/src/shared/lib/auth.ts`, `stateMachine.ts` sau khi đồng bộ T30 |
| Trạng thái tài liệu | Mọi điểm ❓ là đề xuất, chờ nhóm xác nhận — giống `06-rbac-matrix.md` |

## 1. Bảng quyền 5 vai trò (`auth.ts`, sau khi đồng bộ T30)

| Permission | ADMIN | CLINICIAN | TECHNICIAN | RADIOLOGIST | APPROVER |
|---|---|---|---|---|---|
| `patient.create` | ✔ | ✔ | ✔ | — | — |
| `patient.update` | ✔ | ✔ | ✔ | — | — |
| `order.sync` | ✔ | ✔ | ✔ | — | — |
| `clinical.view` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `report.write` | — | — | — | ✔ | — |
| `report.approve` | — | — | — | — | ✔ |
| `study.markReceived` | ✔ | — | ✔ | — | — |
| `study.reopen` | ✔ | — | — | — | ✔ |
| `study.cancel` **(mới)** | ✔ | — | ✔ | — | — |
| `study.release` **(mới)** | ✔ | — | — | — | — |
| `conflict.resolve` **(mới)** | ✔ | — | ✔ | — | — |
| `audit.view` **(mới)** | ✔ | — | — | — | — |
| `list.print` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `report.print` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `study.viewImage` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `config.system` | ✔ | — | — | — | — |

Đổi so với bản trước (T30): bỏ `report.write`/`report.approve` khỏi `ADMIN` (D15); thêm `APPROVER`
vào `study.reopen` (D16); thêm 4 permission mới `study.cancel`, `study.release`,
`conflict.resolve`, `audit.view` — chưa gắn vào bất kỳ nút nào (xem mục 3).

## 2. Component × permission × trạng thái code

| Component | File | Permission dùng | Tab/trạng thái mặc định theo vai trò | Trường khóa theo vai trò | Trạng thái |
|---|---|---|---|---|---|
| `WorklistPage` | `features/worklist/pages/WorklistPage.tsx` | `list.print` (nút "In/Tải danh sách"); gọi `openGated` với `clinical.view`, `report.print` | **Có (mới, T30):** `RADIOLOGIST` → tab "Đã thực hiện" lọc `UNREAD`; `APPROVER` → tab "Đã thực hiện" lọc `READ` hoặc `APPROVING` (tab có nhiều ca hơn theo `useStatusCounts`, mặc định `READ` nếu chưa tải xong số đếm); `CLINICIAN`/`TECHNICIAN`/`ADMIN` giữ tab "Chờ" (không đổi) | — | Đã code |
| `Sidebar` | `features/worklist/components/Sidebar.tsx` | Không kiểm permission (chỉ là bộ lọc hiển thị theo `SidebarFilters`, `WorklistPage` ghi đè `statuses` khi áp tab mặc định ở trên) | — | — | Đã code |
| `TopBar` | `features/worklist/components/TopBar.tsx` | `patient.create` (nút "Thêm bệnh nhân"), `config.system` (icon mở popover cấu hình, chỉ `ADMIN` mở được) | — | — | Đã code |
| `SystemConfigMenu` (trong `TopBar.tsx`) | `features/worklist/components/TopBar.tsx` | `list.print`, `report.approve` (nút "Duyệt toàn bộ danh sách" — H-05, [HOÃN], nút không có chức năng), `patient.create` | — | — | Giao diện có, nút chưa có chức năng (H-05) |
| `PatientPanel` | `features/worklist/components/PatientPanel.tsx` | `patient.update` ("Cập nhật"), `order.sync` ("Cập nhật từ HIS"), `patient.create` ("Thêm chỉ định"), `clinical.view` ("Lâm sàng"), `report.print` ("In"), `study.viewImage` ("Xem ảnh chụp"), **`study.markReceived`** ("Đánh dấu đã có ảnh", T2) và **`study.cancel`** ("Hủy ca", T10) — hai nút sau chỉ dựng khi ca đang `SCHEDULED`; ở trạng thái đó "Xem ảnh chụp" và "Báo cáo" bị ẩn cho đỡ chật | — | — | Đã code |
| `AddStudyModal` | `features/studies/components/AddStudyModal.tsx` | Không tự kiểm (mở qua nút đã gated `patient.create` ở `TopBar`/`PatientPanel`) | — | — | ✅ **Đã nối API 2026-11-12** — `POST /patients` (khi tick "Thêm mới bệnh nhân") rồi `POST /imaging-orders` kèm một ca chụp; xử lý 409 `PATIENT_DUPLICATE_CODE`/`PATIENT_SUSPECTED_DUPLICATE` và 400 `VALIDATION_ERROR` |
| `UpdateStudyModal` | `features/studies/components/UpdateStudyModal.tsx` | Không tự kiểm (mở qua nút đã gated `patient.update` ở `PatientPanel`) | — | **Có (mới, T30):** `CLINICIAN` — khóa (disable, không ẩn) 5 trường định danh `Mã` (`patient_code`), `Họ tên` (`full_name`), `Ngày sinh` (`date_of_birth`), `Giới tính` (`gender`), `BHXH` (`social_insurance_no`), tooltip "Chỉ KTV hoặc Admin được sửa trường này". `TECHNICIAN`/`ADMIN` sửa được tất cả. `Địa chỉ`, `Chẩn đoán ban đầu`, `StudyInstanceUID` không bị khóa thêm (ngoài phạm vi D24) | ✅ **Đã nối API 2026-11-12** — trường bệnh nhân đi `PATCH /patients/{id}`, trường chỉ định đi `PATCH /imaging-orders/{id}`, trường ca chụp (máy chụp, `study_instance_uid`) đi `PATCH /studies/{id}`. Thêm **ô đổi máy chụp** (nguồn `GET /devices`) và **bảng so sánh chỉ gồm trường đã đổi** hiện trước khi bấm Lưu. `PATCH /studies/{id}` đã có trong `openapi.yaml` nhưng backend chưa cài (KAN-34) → ở chế độ `live` báo rõ phần nào chưa lưu được |
| `UpdateFromHisModal` | `features/studies/components/UpdateFromHisModal.tsx` | Không tự kiểm (mở qua nút đã gated `order.sync` ở `PatientPanel`) | — | — | ⚠️ **Tra cứu đã nối API 2026-11-12** (`GET /imaging-orders`, `GET /patients`), nhưng nút "Cập nhật" **vẫn khóa**: chưa có endpoint đồng bộ HIS nào trong `openapi.yaml`, Mock HIS theo HL7 v2 còn `H-03` [HOÃN]. Không phải màn "Danh sách lệch dữ liệu" (`conflict.resolve`) |
| `ClinicalModal` | `features/clinical/components/ClinicalModal.tsx` | `clinical.view` (mở qua `openGated` ở `WorklistPage`); `study.viewImage` (nút "Xem ảnh" tab 3, IN-23 cửa vào b) | — | — | Đã code (tab 1–3 nối dữ liệu thật; tab 4–5 bảng rỗng theo thiết kế) |
| `ReportModal` | `features/reports/components/ReportModal.tsx` | `report.write` (sửa nội dung báo cáo + nút "Lưu nháp"); mỗi nút chuyển trạng thái sinh từ `stateMachine.TRANSITIONS`, lọc theo `can(user, t.permission)`: T3/T4/T5 → `report.write`, T6/T7/T8 → `report.approve`, T9 → `study.reopen` | — | — | Đã code — **chưa kiểm** điều kiện bắt buộc (trường rỗng, khóa mềm, người duyệt ≠ người đọc); backend phải kiểm lại (`03-state-machine.md` mục 2.4) |
| `PrintModal` | `features/printing/components/PrintModal.tsx` | `report.print` (mở qua `openGated` ở `WorklistPage`) | — | — | Đã code |
| `WorklistTable` | `features/worklist/components/WorklistTable.tsx` | `study.viewImage` (icon "Xem ảnh" ở hàng worklist, IN-23 cửa vào a) | — | — | Đã code |

## 3. Permission chưa gắn UI nào (liệt kê, không tự tạo giao diện)

Theo đúng yêu cầu khi đồng bộ (T30): các permission dưới đây đã thêm vào `auth.ts` theo đề xuất
ở `06-rbac-matrix.md` mục 6, nhưng **không có component/nút/màn hình nào trong Frontend hiện tại
dùng tới** — không tự tạo giao diện mới ngoài phạm vi được giao.

| Permission | Vai trò | Màn hình còn thiếu | Story liên quan (`13-user-stories.md`) |
|---|---|---|---|
| ~~`study.cancel`~~ | `ADMIN`, `TECHNICIAN` | ✅ **Đã làm 2026-11-12** — nút "Hủy ca" ở `PatientPanel` (chỉ hiện khi ca `SCHEDULED`), mở `StudyTransitionDialog` bắt nhập lý do. `CANCELLED` đã vào `StudyStatus` Frontend và `T10` đã vào `stateMachine.ts` (backend `enu.StudyStatus` đã có `CANCELLED`) | US-KTV-08 |
| `study.release` | `ADMIN` | Nút "Giải phóng khóa mềm" khi `ADMIN` muốn thực hiện T4 thay người đang đọc — Frontend hiện **không có khóa mềm** (`reading_user_id`/`approving_user_id`), nút T4 trong `ReportModal` hiện dùng chung `report.write` (chỉ `RADIOLOGIST`), không phân biệt được trường hợp `ADMIN` giải phóng khóa | US-ADMIN-06 |
| `conflict.resolve` | `ADMIN`, `TECHNICIAN` | Màn "Danh sách lệch dữ liệu" (`identity_conflict`, ba lựa chọn `KEEP_RIS`/`TAKE_HIS`/`MANUAL_EDIT`) — `UpdateFromHisModal` hiện có **không phải** màn này | US-KTV-07, US-ADMIN-02, US-ADMIN-03 |
| `audit.view` | `ADMIN` | Màn xem `audit_log` theo bệnh nhân/ca — chưa có route, chưa có component | US-ADMIN-04 |

**Cập nhật 2026-11-12.** `study.markReceived` trước đây cũng không có nút riêng — chỉ chạm tới được
qua `ReportModal` (vì `TRANSITIONS` có `T2` và modal sinh nút từ đó), tức là KTV phải mở màn "Báo cáo"
để nói rằng ảnh đã về, rất phản trực giác. Nay đã có nút **"Đánh dấu đã có ảnh"** ngay ở `PatientPanel`.

Điều kiện hiển thị của hai nút mới (Frontend chỉ ẩn/khóa, backend vẫn chốt):

| Nút | Hiện khi | Khóa kèm lý do khi |
|---|---|---|
| "Đánh dấu đã có ảnh" (T2) | ca `SCHEDULED` **và** có `study.markReceived` | chưa có `study_instance_uid` (SM-12) |
| "Hủy ca" (T10) | ca `SCHEDULED` **và** có `study.cancel` | đã có `study_instance_uid` (RBAC-12) |

Cả hai mở `features/studies/components/StudyTransitionDialog.tsx`; T10 là nhánh ngoại lệ nên **bắt
buộc nhập lý do** trước khi gửi (SM-11), lý do được ghi vào `study_status_history`.

## 4. Câu hỏi còn mở (❓ chưa chốt, không tự quyết)

1. Mã lỗi/cơ chế từ chối khi `CLINICIAN` sửa trường định danh ở `UpdateStudyModal` — Frontend đã
   chọn **disable kèm tooltip** (giữ nguyên giá trị hiển thị, không ẩn), nhưng backend trả `403`
   hay chỉ bỏ qua trường khi `CLINICIAN` cố gọi thẳng API vẫn **chưa chốt** (`06-rbac-matrix.md`
   mục 5, `13-user-stories.md` mục 7 câu 2).
2. Tab mặc định của `APPROVER` khi `useStatusCounts` chưa tải xong (lần đầu vào worklist, mạng
   chậm): hiện tại giữ tab "Chờ" cho tới khi có số đếm rồi mới đổi sang `READ`/`APPROVING` — có
   thể gây giật tab ngay sau khi đăng nhập. Chưa hỏi ý kiến nhóm UX, tạm chấp nhận vì tải worklist
   vốn đã thường dưới 1 giây ở môi trường mock/dev.
3. `study.release` qua T4: chưa rõ nên tách một permission riêng cho "Admin giải phóng khóa" hay
   dùng chung `report.write`/`study.release` một khi khóa mềm được cài đặt thật — để ngỏ tới khi
   khóa mềm (D20) được code.
