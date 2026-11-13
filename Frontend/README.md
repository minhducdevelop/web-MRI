# VR-RIS PACS — Frontend

Giao diện RIS. Stack: **React 19 · TypeScript · Vite 7 · Tailwind CSS 4**, không dùng thư viện UI ngoài —
mọi control (nút, input, select, modal, popover, tag, icon) đều tự viết trong `src/shared/ui`.

## Chạy

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # ra dist/, dùng cho image nginx ở deploy/docker/frontend.Dockerfile
```

Yêu cầu Node.js 20+.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_MODE` | `mock` | `mock` chạy mock server trong trình duyệt; `live` gọi backend thật |
| `VITE_API_BASE_URL` | `/api/v1` | Đường dẫn tương đối **cùng origin** (`doc/14` mục 3.2) — nginx của `ris-frontend` proxy `/api/` sang backend nên không cần CORS |
| `VITE_DEV_API_TARGET` | `http://localhost:8080` | Khi `npm run dev`, proxy của Vite thay vai trò nginx |
| `VITE_PERSIST_SESSION` | `false` | `true` thì access token sống qua lần tải lại trang — **nợ kỹ thuật**, xem `src/shared/api/session.ts` |
| `VITE_OHIF_BASE_URL` | — | Base URL của OHIF để mở deep-link (IN-23, chưa dùng) |

Gọi backend thật:

```bash
VITE_API_MODE=live npm run dev
```

## Đăng nhập

Mock server dùng đúng 7 tài khoản seed của `database/migrations/V7` + `V8`, mật khẩu chung `123456`:
`admin`, `bslamsang`, `ktv`, `bscdha`, `bscdha2`, `bsduyet`, `bsduyet2`.

Chưa đăng nhập mà vào `/worklist` thì bị chuyển về `/login` và quay lại đúng chỗ sau khi đăng nhập.
Access token giữ trong **bộ nhớ** (không phải localStorage) theo đề xuất ở `doc/09` mục 1.2, nên tải lại
trang là mất phiên — đổi hành vi này bằng `VITE_PERSIST_SESSION`, nhưng phải ghi nợ kỹ thuật.

Xử lý lỗi theo `doc/06` mục 8: **401** → dọn phiên, về trang login; **403** → hiện dải cảnh báo
"không đủ quyền", **không** đăng xuất.

## Cấu trúc

Theo `doc/15-kien-truc-backend.md` mục 7: component **không** gọi thẳng `fetch`, chỉ đi qua hook →
tầng `api` của feature → `shared/api`.

```
src/
  app/App.tsx                  router + AuthProvider + RequireAuth
  shared/
    ui/                        Icon, controls (Button/Input/Select/Modal/Popover/Tag/Textarea), StatusChip
    lib/                       types (mã ERD), status, stateMachine, auth (RBAC), format
    api/
      http.ts                  HttpClient trên fetch + ApiError (401/403)
      dto.ts                   DTO snake_case đúng openapi.yaml
      mappers.ts               DTO → kiểu miền camelCase
      session.ts               nơi giữ access token
      client.ts                chọn mock hay live
      mock/{seed,mockClient}   mock server trong trình duyệt, chép đúng seed V7+V8
    hooks/useAsync.ts          hook gọi API dùng chung
  features/
    auth/                      api, useAuth, RequireAuth, LoginPage
    worklist/                  api, hooks, Sidebar/TopBar/WorklistTable/PatientPanel/RelatedOrders/Pagination, WorklistPage
    clinical/                  api + ClinicalModal (5 tab)
    reports/                   api, useStudyReport, ReportModal
    studies/                   AddStudyModal, UpdateStudyModal, UpdateFromHisModal
    printing/                  api, printSheet, PrintModal
```

## Những chỗ bám tài liệu

- **Mã trạng thái** dùng mã DB/API (`SCHEDULED/UNREAD/READING/READ/APPROVING/APPROVED`),
  nhãn tiếng Việt nằm trong `shared/lib/status.ts`. `CANCELLED` **chưa có** — còn ❓, khớp
  `enu.StudyStatus` của backend (nợ kỹ thuật, `doc/12` TC-16).
- **Tuổi** lấy `age` + `age_approximate` từ API: `~68` khi ngày sinh chỉ có năm/tháng, `—` khi
  không có ngày sinh. Không bao giờ ra `0` (`01-scope.md` mục 6 bước 10, TC-09).
- **Chuyển trạng thái** sinh từ `shared/lib/stateMachine.ts` (T2–T9 theo `doc/03`), lọc tiếp theo
  vai trò. Backend vẫn kiểm lại — 403/409 hiện ngay trong modal báo cáo.
- **Kỹ thuật và kết luận** lấy từ báo cáo hiện hành, không lấy từ `study` (`doc/02-erd.md` mục 10).
- **Lọc theo thời gian**: chỉ hai ô chọn ngày, đúng tham số `date_from`/`date_to` của `GET /studies`.
  Năm nút khoảng thời gian nhanh đã bỏ theo yêu cầu của nhóm.
- **Bộ lọc đã [HOÃN]** (đồng bộ HIS, BHYT, ca quá hạn) không dựng, vì backend không có tham số
  tương ứng — dựng ra sẽ là nút bấm không làm gì.

## In phiếu kết quả

Nút **In** ở panel bệnh nhân mở hộp thoại chọn nội dung. Mỗi mục được chọn in ra **một tờ riêng**.

- **In / Lưu PDF**: dựng HTML rồi gọi hộp thoại in của trình duyệt (in giấy hoặc Save as PDF).
  Chạy được cả ở chế độ mock. Trước khi mở hộp thoại có gọi `POST /patients/{id}/print-events`
  để ghi `audit_log` action `PRINT`.
- **Tải PDF từ máy chủ**: gọi `GET /patients/{id}/print-documents` cho từng mục, backend dựng PDF.
  Chỉ bật ở chế độ `live`.

Dữ liệu: chỉ **Kết quả chẩn đoán chức năng chính** là dữ liệu thật của RIS; tổng quan khám và
xét nghiệm là dữ liệu giả trong `clinical_snapshot`; đơn thuốc và phẫu thuật thủ thuật còn rỗng —
hộp thoại ghi rõ từng mục lấy dữ liệu từ đâu.

⚠️ In ấn phiếu lẻ vẫn là chức năng phụ `H-05` [HOÃN] ở `01-scope.md` mục 4. Muốn đưa hẳn vào IN thì phải
ghi bảng thay đổi phạm vi (mục 9) và chốt quyền `report.print` ở `doc/06` mục 3.

## Tải danh sách & In danh sách (`IN-25` ❓)

Các nút **"Tải danh sách"** và **"In danh sách"** trên thanh công cụ worklist (cùng **"Tải toàn bộ danh sách"** / **"In toàn bộ danh sách"** trong menu Cấu hình hệ thống):

- **Tải danh sách**: gọi `GET /studies/export` (hoặc `GET /patients/export`), trả về file CSV (`UTF-8` có BOM `\uFEFF` để mở trực tiếp bằng Excel giữ nguyên tiếng Việt, chống CSV Formula Injection). Backend tự động ghi `audit_log` với `action = 'EXPORT'` (kèm `patient_id` nếu danh sách xuất chỉ thuộc 1 bệnh nhân, `NULL` nếu nhiều bệnh nhân theo `doc/09` mục 2.2).
- **In danh sách**: gọi `POST /patients/export-events` để ghi `audit_log` với `action = 'EXPORT'`, sau đó dựng bảng HTML danh sách ca chụp và mở hộp thoại in của trình duyệt.
- Hoạt động ở cả hai chế độ `mock` và `live`, chỉ dùng dữ liệu giả (`R-03`), cột Tuổi tuân thủ `AgeCalculator` (`~68` khi ngày sinh chỉ biết năm/tháng, `—` khi không có ngày sinh, không bao giờ là `0`).

## Thao tác ghi dữ liệu

| Màn | Gọi endpoint | Ghi chú |
|---|---|---|
| **Thêm ca chụp** (`AddStudyModal`) | `POST /patients` → `POST /imaging-orders` | Backend bắt buộc `studies` không rỗng, nên một lần tạo luôn sinh **một chỉ định + một ca chụp**. Bỏ tick "Thêm mới bệnh nhân" để tìm bệnh nhân có sẵn qua `GET /patients` |
| **Cập nhật ca chụp** (`UpdateStudyModal`) | `PATCH /patients/{id}`, `PATCH /imaging-orders/{id}`, `PATCH /studies/{id}` | Có ô đổi máy chụp và bảng so sánh chỉ gồm trường đã đổi |
| **Đánh dấu đã có ảnh** (T2) · **Hủy ca** (T10) | `POST /studies/{id}/transitions` | Nút ở `PatientPanel`, chỉ hiện khi ca `SCHEDULED` |
| **Cập nhật từ HIS** | `GET /imaging-orders`, `GET /patients` | Chỉ **tra cứu**; nút "Cập nhật" khóa vì chưa có endpoint đồng bộ HIS (H-03 [HOÃN]) |

Mã lỗi backend được dịch sang câu người dùng đọc được trong `features/studies/components/AddStudyModal.tsx`
(`messageFor`): `409 PATIENT_DUPLICATE_CODE`, `409 PATIENT_SUSPECTED_DUPLICATE`, `400 VALIDATION_ERROR`,
`403`. Không có quyền thì **không gọi API** — nút bị khóa từ trước.

## Quyền hiển thị nút

`src/shared/lib/auth.ts` là nguồn duy nhất, khớp `doc/06b-ui-permission-spec.md` mục 1.
`src/shared/lib/auth.test.ts` **khóa bảng này lại**: ma trận 16 permission × 5 vai trò và bảng
T2–T10 được chép tay từ tài liệu, nên sửa code mà quên sửa tài liệu (hoặc ngược lại) là test đỏ.

```bash
npm run test
```

## Chưa làm

- Màn **audit log** (IN-15, `audit.view`), **quản lý người dùng**, màn **"Danh sách lệch dữ liệu"**
  (`conflict.resolve`) và nút **"Giải phóng khóa mềm"** (`study.release`) — xem
  `doc/06b-ui-permission-spec.md` mục 3.
- `PATCH /studies/{id}` đã có trong `openapi.yaml` và mock server, nhưng **backend chưa cài**
  (KAN-34) — ở chế độ `live` phần đổi máy chụp sẽ báo chưa lưu được.
- Lọc theo **Chỉ định** và **Bộ phận chụp** hiện lọc phía client trên trang đang xem, vì
  `GET /studies` chưa có tham số tương ứng trong `openapi.yaml`.
- Chế độ `live` vẫn **chưa đăng nhập được**: backend chưa có `/auth/login`.
