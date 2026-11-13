# AGENTS.md — VR-RIS PACS

Hướng dẫn ngắn cho mọi agent/AI làm việc trong repo này. Không chép lại `README.md` — chỉ trỏ sang đúng chỗ và nhắc lại ở dạng rút gọn.

## 1. Repo này là gì

Đồ án môn học: RIS (Radiology Information System) tích hợp PACS + AI hỗ trợ đọc phim cho bệnh viện giả lập, không triển khai lâm sàng thật. Stack: React · Java Spring Boot · MySQL · Docker + Kubernetes (local). Chi tiết đầy đủ, bối cảnh, kiến trúc, lịch 8 tuần: **`README.md`** — đọc trước khi làm bất cứ việc gì.

## 2. Bắt buộc đọc trước khi làm

Thứ tự bắt buộc, không bỏ bước: **`README.md` → `doc/01-scope.md` → `doc/02-erd.md`**. Ba file này là gốc; mọi file khác tham chiếu ngược về chúng.

Sau đó, chọn nhánh theo việc được giao (mục lục đầy đủ + sơ đồ phụ thuộc: **README mục 6.0**):

| Muốn làm X | Đọc |
|---|---|
| Phạm vi, IN/HOÃN, nghiệm thu | `doc/01-scope.md` |
| Tên bảng/cột, migration | `doc/02-erd.md`, `database/migrations/` |
| Trạng thái ca chụp, ai chuyển được, điều kiện | `doc/03-state-machine.md` |
| Lệch dữ liệu HIS ↔ RIS, khóa đối chiếu | `doc/04-his-ris-reconciliation.md` |
| Chụp lại / hủy / sai thông tin / mất kết nối HIS | `doc/05-luong-ngoai-le.md` |
| Ai được gọi endpoint nào | `doc/06-rbac-matrix.md` |
| DICOM, AE Title, MWL, C-STORE, deep-link OHIF | `doc/07-pacs-dicom.md` |
| HL7 v2 (`ORM`/`ORU`), `HisGateway`, idempotency | `doc/08-hl7-message-spec.md` |
| Xác thực, audit log, transaction, secret | `doc/09-bao-mat-toan-ven-du-lieu.md` |
| Mọi liên kết giữa các thành phần, khóa nối | `doc/10-lien-ket-he-thong.md` |
| Kiến trúc backend (package, ArchUnit, lát dọc) | `doc/15-kien-truc-backend.md` |
| API contract | `doc/api/openapi.yaml` |
| Quy ước UI, cấu trúc Frontend | `Frontend/README.md` |

**Hạng mục gắn nhãn `[HOÃN]` thì không làm**, trừ khi người dùng yêu cầu rõ. Thiếu thông tin cần thiết (ô ❓ chưa có câu trả lời ở README mục 9) → **hỏi người dùng, không tự giả định**.

## 3. Nguyên tắc bất biến

Nguồn đầy đủ: **README mục 0**. Danh sách không được phá nếu không có quyết định rõ ràng của người dùng:

- RIS **không** lưu/xử lý ảnh DICOM — PACS là nguồn ảnh duy nhất.
- Máy chụp gửi ảnh **thẳng vào PACS**, không qua RIS.
- AI **không** tự động trả kết quả chính thức — luôn cần bác sĩ CĐHA xác nhận (human-in-the-loop).
- Mọi hành vi đọc/sửa/duyệt dữ liệu bệnh nhân phải ghi `audit_log`.
- Tích hợp dùng chuẩn mở (DICOM / HL7 / FHIR), không tự chế protocol riêng.
- **Không dùng dữ liệu bệnh nhân thật** ở bất kỳ đâu (seed, test, ảnh demo, slide). Ảnh chụp màn hình tham chiếu phải che tên/mã bệnh nhân/LSVV/`StudyInstanceUID` **trước khi** commit/upload.
- OHIF và Orthanc **không được mở công khai** — chỉ trong cụm Kubernetes local hoặc sau khi đã đăng nhập RIS.
- Stack đã chốt (README mục 8.1) không đổi nếu không có yêu cầu từ người dùng.
- **R-05 — Backend kiến trúc phân tầng** (package-by-layer, hướng phụ thuộc một chiều, kiểm bằng ArchUnit; vi phạm làm build đỏ). Mỗi tính năng làm theo **lát dọc** (rest → service → dao → model → DB), không làm "toàn bộ entity trước, toàn bộ controller sau".

## 4. Quy ước code

**Backend** (nguồn đầy đủ: `doc/15-kien-truc-backend.md`):

- Package-by-layer dưới `com.vrris.pacs`: `rest/ → service/ → service/impl/ → dao/ → hibernateDao/ → model/`, cắt ngang có `dto/`, `mapper/`, `enu/`, `exception/`, `rule/`, `integration/` (+`integration/impl/`), `audit/`, `security/`, `config/`. Hướng phụ thuộc một chiều — không đi ngược từ `model`/`dao` lên `service`/`rest`.
- **Hibernate DAO tự viết** bằng `EntityManager` + Criteria API (`BaseDao`/`AbstractHibernateDao`) — **không** dùng Spring Data JPA repository (chặn bởi luật ArchUnit L9).
- Mapping entity ↔ DTO bằng **MapStruct**. `rest` không bao giờ thấy `model` trực tiếp.
- Test tầng DAO bằng **Testcontainers (MySQL 8)**, không dùng H2 — khớp đúng dialect `database/migrations/`.
- **ArchUnit đỏ là build đỏ** (9 luật L1–L9, `src/test/java/.../architecture/LayeredArchitectureTest.java`, chạy cùng `mvn verify`). Trước khi coi một thay đổi backend là xong: chạy `mvn verify` và phải xanh.
- `@Transactional` chỉ đặt trong `service/impl` (luật L6).
- `rule/` thuần Java, không import Spring/Hibernate/`model`/`dao`/`service` (luật L5) — đây là chỗ đặt logic nghiệp vụ như state machine, tính tuổi.
- Audit log ghi bằng AOP (`audit/Audited` + `audit/AuditLogAspect`), **đồng bộ**, không rải lệnh ghi log trong `service/impl`.
- Quy ước đặt tên lớp theo tầng: xem `doc/15-kien-truc-backend.md` mục 6.

**Frontend** (nguồn đầy đủ: `Frontend/README.md`, README mục 8.3):

- React 19 + TypeScript + Vite 7 + Tailwind CSS 4. **Không dùng thư viện UI ngoài** — mọi control (nút, input, select, modal, popover…) tự viết, không thêm Ant Design/TanStack Query/Axios dù README mục 8.2 từng gợi ý vậy (đã ghi nhận lệch ở mục 8.3, giữ nguyên code thực tế, không ép về gợi ý cũ).
- Cấu trúc: `features/<tên>/{api,hooks,components,pages}` + `shared/{api,lib,ui,hooks}` (`doc/15` mục 7). Component **không** gọi thẳng `fetch`/Axios — chỉ qua hook → tầng `api` của feature → `shared/api`. Alias `@/` trỏ tới `src/`.
- Kiểu dữ liệu (`src/shared/lib/types.ts`) dùng mã trạng thái **DB/API** ở `doc/02-erd.md` mục 4.5, đủ **7 giá trị kể cả `CANCELLED`** (khớp `enu.StudyStatus` backend, từ 2026-11-12). Điều kiện của T10 vẫn còn ❓ ở `doc/03` mục 2.2 — Frontend chỉ ẩn/khóa nút.
- Quyền hiển thị nút: `src/shared/lib/auth.ts` là nguồn duy nhất, **được `src/shared/lib/auth.test.ts` khóa vào `doc/06b-ui-permission-spec.md` mục 1** — sửa một bên mà quên bên kia là test đỏ.
- Hai chế độ chạy: `VITE_API_MODE=mock` (mặc định, mock server trong trình duyệt chép đúng seed V7+V8) và `live` (gọi backend thật). Xem `Frontend/README.md`.
- Frontend **không phải lớp bảo vệ** quyền/điều kiện chuyển trạng thái — backend luôn phải kiểm tra lại, kể cả khi UI đã khóa nút.

## 5. Lệnh hay dùng

Chỉ ghi lệnh đã chạy thử được trong phiên làm việc gần nhất của dự án; lệnh đánh dấu "chưa kiểm chứng" là suy ra từ tài liệu, chưa tự chạy.

| Việc | Lệnh | Đã kiểm chứng? |
|---|---|---|
| Bật database (MySQL + Flyway) | `cd database && docker compose up -d` | ✅ (chạy thật trên MySQL 8.4.9, `database/README.md`) |
| Xem Flyway đã chạy gì | `docker compose logs flyway` (trong `database/`) | ✅ |
| Build + test backend (ArchUnit + Testcontainers) | `cd Backend && mvn verify` | ✅ (**192/192 test, BUILD SUCCESS**, 2026-11-12 — **phải bật Docker Desktop trước**, nếu không mọi test DAO/controller đỏ với "Could not find a valid Docker environment") |
| Chạy backend (cần database đã bật) | `cd Backend && mvn spring-boot:run` | Chưa kiểm chứng trong phiên này — theo `Backend/README.md` |
| Chạy frontend (dev) | `cd Frontend && npm install && npm run dev` | ✅ (2026-11-06, chạy ở chế độ mock mặc định) |
| Build frontend | `cd Frontend && npm run build` | ✅ (2026-11-06) |
| Lint frontend | `cd Frontend && npx eslint src` | ✅ (2026-11-12, 0 lỗi) |
| Test frontend (vitest) | `cd Frontend && npm run test` | ✅ (2026-11-12, **42/42**) |
| Gọi backend thật thay vì mock | `cd Frontend && VITE_API_MODE=live npm run dev` | ⚠️ Chạy được nhưng **chưa đăng nhập được** — backend chưa có `/auth/login` |
| Xuất sơ đồ Mermaid (`.mmd` → `.png`) | `npx --yes @mermaid-js/mermaid-cli -i "doc/diagrams/<ten>.mmd" -o "doc/diagrams/<ten>.png" -b white -s 2` | ✅ (chạy được trong phiên tạo `doc/08-hl7-message-spec.md` và `doc/10-lien-ket-he-thong.md`, 2026-11-05 — môi trường trước đó từng báo không chạy được, xem `doc/02-erd.md` mục 0; **3 ảnh cũ (`02-erd`, `01-ranh-gioi-he-thong`, `05-state-machine`) vẫn chưa được xuất lại dù lệnh đã chạy được — cần ai đó làm, không tự ý xuất lại ảnh người khác chưa nhờ** |

## 6. Quy ước tài liệu

- Viết tiếng Việt, giữ nguyên thuật ngữ gốc (`ORM^O01`, MLLP, AE Title, Accession Number…).
- Trạng thái tài liệu: 🟡 nháp chưa xác nhận · ✅ nhóm đã xác nhận · ⬜ chưa viết. Đánh **❓** tại chỗ chưa chốt thay vì tự giả định, gom vào mục "Câu hỏi còn mở" cuối file.
- **Một thông tin một nguồn** (README mục 6.0): phạm vi → `01`; bảng/cột → `02`; trạng thái → `03`; quyền → `06`; DICOM tag → `07`; HL7 field → `08`; liên kết hệ thống → `10`; kiến trúc backend → `15`. File khác **tham chiếu**, không chép lại.
- Thêm hoặc sửa một file `doc/*.md` thì cập nhật **README mục 6.0** (bảng trạng thái) và thêm một dòng ở **README mục 11** (lịch sử thay đổi).
- Sơ đồ: nguồn `.mmd` trong `doc/diagrams/`, xuất `.png` **cùng tên**. **Luôn bọc nhãn cạnh trong dấu ngoặc kép** (`"L-01"`, không phải `L-01` trần) — dự án đã gặp lỗi hiển thị vì thiếu bước này (README mục 11, 2026-11-05).
- Không dùng tên, mã bệnh nhân hay mã LSVV/`StudyInstanceUID` thật trong ví dụ — kể cả ví dụ minh họa trong tài liệu kỹ thuật.

## 7. Việc không được tự làm

- Trả lời thay nhóm các câu hỏi ở **README mục 9** (Câu hỏi còn mở) — kể cả khi có vẻ "hợp lý". Gặp câu chưa trả lời: hỏi người dùng.
- Đổi stack đã chốt ở **README mục 8.1** (React, Spring Boot, MySQL, Docker+K8s local, OHIF).
- Đưa dữ liệu bệnh nhân thật vào repo dưới bất kỳ hình thức nào.
- Mở Orthanc/OHIF ra Internet, kể cả tạm thời để demo.
- Sửa các file migration `database/migrations/V1…V7` đã có — đổi schema thì thêm file `V8`, `V9`… mới (`database/README.md`).

## 8. Trạng thái hiện tại

Lấy từ **README mục 7.2** (cập nhật 2026-11-12) — không tự ước đoán, kiểm tra lại mục đó nếu nghi ngờ đã cũ.

| Có rồi | Chưa có |
|---|---|
| Frontend **đã nối lớp API** (mock server + chế độ `live`), đăng nhập + chặn route; nút "Xem ảnh" (IN-23); **ba modal tạo/sửa đã gửi dữ liệu thật**; nút **"Đánh dấu đã có ảnh" (T2)** và **"Hủy ca" (T10)** | Màn audit log (`audit.view`), quản lý người dùng, màn "Danh sách lệch dữ liệu" (`conflict.resolve`), nút "Giải phóng khóa mềm" (`study.release`) — xem `doc/06b` mục 3 |
| Backend: reference-data, patient, imaging-order, worklist (IN-07/IN-09), StudyDetail, report (IN-10), clinical-snapshot (IN-11), identity-conflict (IN-05), in phiếu PDF, deep-link OHIF; `mvn verify` xanh **192/192** | Backend: `/auth/login`, **`POST /studies/{id}/transitions`** (KAN-31) và **`PATCH /studies/{id}`** (KAN-34) — cả hai đã có trong `openapi.yaml` và trong mock server, Frontend đã gọi sẵn; RBAC đầy đủ (JWT hiện chỉ đọc claim `roles` thô) |
| `database/` — MySQL 8.4 + Flyway qua Docker Compose (V1–V8, 14 bảng + seed giả); `deploy/docker/` + `deploy/k8s/` + `deploy/compose/` (đã tích hợp Orthanc + OHIF Viewer) | `kubectl apply` trên cụm thật (mới dựng offline bằng `kubectl kustomize`) |
| `doc/api/openapi.yaml` (nháp v0.2, 28 endpoint — thêm viewer-link và 2 endpoint in, ❓ chưa chốt) | — |
| Bộ tài liệu thiết kế 01–16 (đều nháp, xem README mục 6.0 cho trạng thái từng file) | Nhóm xác nhận các bản nháp — chưa file nào ở trạng thái ✅ |
| `.github/workflows/backend-ci.yml`, `frontend-ci.yml` (file đã có); `Backend/` **đã commit** | Chạy CI thật trên GitHub |
| — | Design system + wireframe AI Panel trong Figma |

**Lưu ý quan trọng:** bảng trên cập nhật 2026-11-12. `Backend/` nay **đã nằm trong git** (112 file) — ghi chú cũ "chưa commit" không còn đúng. Luôn kiểm tra `git status`/`git log` trước khi giả định trạng thái.
