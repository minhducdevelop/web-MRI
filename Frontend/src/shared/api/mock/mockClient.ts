/**
 * Mock server chạy ngay trong trình duyệt. Cài đúng interface `HttpClient` nên khi backend
 * sẵn sàng chỉ cần đổi `VITE_API_MODE=live` là chạy thật, không sửa component hay hook.
 *
 * Đường dẫn, tham số và hình dạng phản hồi bám `doc/api/openapi.yaml`.
 */
import { ApiError, type HttpClient, type HttpRequest, type QueryValue } from '../http'
import type {
  ClinicalSnapshotDto, LoginResponseDto, PageDto, ReportDto, ReportWriteDto, StatusCountsDto,
  StatusHistoryEntryDto, StudyDto, TransitionRequestDto, TransitionResultDto, WorklistRowDto,
} from '../dto'
import { TRANSITIONS } from '@/shared/lib/stateMachine'
import type { ReportStatus, StudyStatus } from '@/shared/lib/types'
import {
  CLINICAL_SNAPSHOTS, DEMO_PASSWORD, DEPARTMENTS, DEVICES, IMAGING_ORDERS, PATIENTS, REPORTS,
  SERVICE_ITEMS, STATUS_HISTORY, STUDIES, USERS, userRef,
} from './seed'

/** Độ trễ giả để giao diện lộ ra trạng thái đang tải, giống gọi mạng thật. */
const LATENCY_MS = 120

const delay = () => new Promise<void>(resolve => setTimeout(resolve, LATENCY_MS))

/* --------------------------------------------------------------- Trạng thái */

// Bản sao có thể sửa: thao tác trong phiên (tạo bệnh nhân, chuyển trạng thái, lưu nháp) ghi vào đây.
const patients = PATIENTS.map(p => ({ ...p }))
const orders = IMAGING_ORDERS.map(o => ({ ...o }))
const studies = STUDIES.map(s => ({ ...s }))
const reports = REPORTS.map(r => ({ ...r }))
const history = STATUS_HISTORY.map(h => ({ ...h }))
let historySeq = history.length + 1
let reportSeq = reports.length + 1
let patientSeq = patients.length + 1
let orderSeq = orders.length + 1
let studySeq = studies.length + 1
let currentUserId: number | null = null

/* ------------------------------------------------------------------ Tiện ích */

function ageOf(dob: string | null, precision: string): { age: number | null; approximate: boolean } {
  if (!dob) return { age: null, approximate: precision !== 'DAY' }
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  if (precision === 'DAY' || precision === 'MONTH') {
    const before =
      now.getMonth() < d.getMonth() ||
      (precision === 'DAY' && now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
    if (before) age -= 1
  }
  return { age: age < 0 ? null : age, approximate: precision !== 'DAY' }
}

function patientDto(id: number) {
  const p = patients.find(x => x.id === id)!
  const { age, approximate } = ageOf(p.date_of_birth ?? null, p.dob_precision)
  return { ...p, age, age_approximate: approximate }
}

function currentReportOf(studyId: number): ReportDto | undefined {
  return reports
    .filter(r => r.study_id === studyId)
    .sort((a, b) => b.version - a.version)[0]
}

function rowOf(study: StudyDto): WorklistRowDto {
  const order = orders.find(o => o.id === study.order_id)!
  const report = currentReportOf(study.id)
  return {
    study,
    order,
    patient: patientDto(order.patient_id),
    service_item: SERVICE_ITEMS.find(s => s.id === study.service_item_id)!,
    device: study.device_id == null ? null : DEVICES.find(d => d.id === study.device_id)!,
    department: DEPARTMENTS.find(d => d.id === order.ordering_department_id) ?? null,
    report_summary: report
      ? { version: report.version, status: report.status, technique: report.technique, conclusion: report.conclusion }
      : null,
  }
}

/** Khoa cha kéo theo cả nhánh con (openapi: "gồm cả nhánh con"). */
function departmentBranch(ids: number[]): Set<number> {
  const out = new Set<number>(ids)
  let added = true
  while (added) {
    added = false
    for (const d of DEPARTMENTS) {
      if (d.parent_id != null && out.has(d.parent_id) && !out.has(d.id)) {
        out.add(d.id)
        added = true
      }
    }
  }
  return out
}

const asArray = (v: QueryValue): string[] =>
  v == null ? [] : Array.isArray(v) ? v.map(String) : [String(v)]

const asNumbers = (v: QueryValue): number[] => asArray(v).map(Number).filter(n => !Number.isNaN(n))

function timeFieldValue(study: StudyDto, order: { ordered_at: string }, field: string): string | null {
  if (field === 'ORDERED') return order.ordered_at
  if (field === 'COMPLETED') return study.completed_at ?? null
  return study.scheduled_at
}

function requireAuth() {
  if (currentUserId == null) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập hoặc phiên đã hết hạn.')
  }
}

/* --------------------------------------------------------------- Định tuyến */

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/')
  const a = path.split('/')
  if (p.length !== a.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

function listStudies(query: Record<string, QueryValue>): PageDto<WorklistRowDto> {
  // Không truyền `tab` nghĩa là lấy cả hai tab (dùng cho bảng "ca khác của cùng bệnh nhân").
  const tab = query.tab as string | undefined
  const timeField = (query.time_field as string) ?? 'SCHEDULED'
  const statuses = asArray(query.status) as StudyStatus[]
  const deptIds = asNumbers(query.department_id)
  const deviceIds = asNumbers(query.device_id)
  const branch = deptIds.length ? departmentBranch(deptIds) : null

  const dateFrom = query.date_from ? new Date(`${query.date_from}T00:00:00`) : null
  const dateTo = query.date_to ? new Date(`${query.date_to}T23:59:59`) : null

  const text = (v: QueryValue) => (v == null ? '' : String(v).trim().toLowerCase())
  const patientCode = text(query.patient_code)
  const fullName = text(query.full_name)
  const visitCode = text(query.visit_code)
  const orderCode = text(query.order_code)

  let rows = studies.map(rowOf)

  rows = rows.filter(r => {
    const inPending = r.study.status === 'SCHEDULED'
    if (tab === 'PENDING' && !inPending) return false
    if (tab === 'DONE' && inPending) return false

    if (statuses.length && !statuses.includes(r.study.status)) return false
    if (branch && (r.device == null || !branch.has(r.device.department_id)) && !branch.has(r.order.ordering_department_id)) return false
    if (deviceIds.length && (r.study.device_id == null || !deviceIds.includes(r.study.device_id))) return false
    if (query.modality && r.service_item.modality !== query.modality) return false
    if (query.patient_class && r.order.patient_class !== query.patient_class) return false
    if (patientCode && !r.patient.patient_code.toLowerCase().includes(patientCode)) return false
    if (fullName && !r.patient.full_name.toLowerCase().includes(fullName)) return false
    if (visitCode && !(r.order.visit_code ?? '').toLowerCase().includes(visitCode)) return false
    if (orderCode && !r.order.order_code.toLowerCase().includes(orderCode)) return false

    if (dateFrom || dateTo) {
      const raw = timeFieldValue(r.study, r.order, timeField)
      if (!raw) return false
      const at = new Date(raw)
      if (dateFrom && at < dateFrom) return false
      if (dateTo && at > dateTo) return false
    }
    return true
  })

  const sort = (query.sort as string) ?? ''
  if (sort) {
    const [field, dir] = sort.split(',')
    const sign = dir === 'desc' ? -1 : 1
    const pick = (r: WorklistRowDto): string => {
      switch (field) {
        case 'patient_code': return r.patient.patient_code
        case 'full_name': return r.patient.full_name
        case 'status': return r.study.status
        case 'order_code': return r.order.order_code
        case 'ordered_at': return r.order.ordered_at
        case 'completed_at': return r.study.completed_at ?? ''
        default: return r.study.scheduled_at
      }
    }
    rows = [...rows].sort((a, b) => pick(a).localeCompare(pick(b), 'vi', { numeric: true }) * sign)
  }

  const page = Number(query.page ?? 1)
  const pageSize = Number(query.page_size ?? 20)
  return {
    page,
    page_size: pageSize,
    total: rows.length,
    items: rows.slice((page - 1) * pageSize, page * pageSize),
  }
}

function applyTransition(studyId: number, body: TransitionRequestDto): TransitionResultDto {
  const study = studies.find(s => s.id === studyId)
  if (!study) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Không tìm thấy ca chụp.')

  const from = study.status
  const to = body.to_status
  const actor = userRef(currentUserId!)
  const now = new Date().toISOString()
  const transition = TRANSITIONS.find(t => t.from === from && t.to === to)

  if (!transition) {
    throw new ApiError(
      422, 'STUDY_INVALID_TRANSITION',
      `Không chuyển được từ ${from} sang ${to}.`)
  }

  // Nhánh ngoại lệ (bỏ dở, trả lại, mở lại, hủy) bắt buộc có lý do — SM-11, `openapi.yaml`
  // ghi rõ "chuỗi chỉ có khoảng trắng bị từ chối".
  if (transition.exceptional && !body.reason?.trim()) {
    throw new ApiError(422, 'TRANSITION_REASON_REQUIRED', 'Thao tác này bắt buộc nhập lý do.')
  }

  // T2: chỉ đánh dấu được khi PACS đã có ảnh, tức là ca đã có `study_instance_uid` (SM-12).
  if (transition.code === 'T2' && !study.study_instance_uid) {
    throw new ApiError(
      422, 'STUDY_NO_DICOM_IMAGE',
      'Ca chụp chưa có StudyInstanceUID — chưa có ảnh trong PACS để đánh dấu đã nhận.')
  }

  // T10: chỉ hủy được ca chưa có ảnh (RBAC-12).
  if (transition.code === 'T10' && study.study_instance_uid) {
    throw new ApiError(
      422, 'STUDY_ALREADY_HAS_IMAGE',
      'Ca chụp đã có ảnh trong PACS nên không hủy được.')
  }

  study.status = to
  if (to === 'READING') {
    study.started_at ??= now
    study.reading_user = actor
  }
  if (to === 'UNREAD' && from === 'READING') study.reading_user = null
  if (to === 'UNREAD' && from === 'SCHEDULED') study.completed_at ??= now
  if (to === 'APPROVING') study.approving_user = actor
  if (to === 'APPROVED') study.approving_user = actor

  const entry: StatusHistoryEntryDto = {
    id: historySeq++,
    study_id: studyId,
    from_status: from,
    to_status: to,
    changed_by: actor,
    changed_at: now,
    reason: body.reason ?? null,
    note: body.note ?? null,
  }
  history.push(entry)

  // Trạng thái báo cáo đi kèm bước chuyển: chỉ nhánh "trả lại" (APPROVING → READING) là RETURNED.
  const nextReportStatus: ReportStatus | null =
    to === 'READ' ? 'FINAL'
      : to === 'APPROVED' ? 'APPROVED'
        : to === 'READING' ? (from === 'APPROVING' ? 'RETURNED' : 'DRAFT')
          : null

  let report = currentReportOf(studyId)
  if (nextReportStatus) {
    if (!report) {
      report = {
        id: reportSeq++, study_id: studyId, version: 1, status: nextReportStatus, origin: 'MANUAL',
        technique: null, findings: null, diagnosis: null, conclusion: null, recommendation: null,
        created_by: actor, created_at: now, approved_by: null, approved_at: null,
      }
      reports.push(report)
    } else if (report.status === 'RETURNED' && nextReportStatus === 'FINAL') {
      // Chốt lại sau khi bị trả lại là một version mới (`UK(study_id, version)`).
      report = { ...report, id: reportSeq++, version: report.version + 1, status: 'FINAL', created_by: actor, created_at: now }
      reports.push(report)
    } else {
      report.status = nextReportStatus
    }
    if (to === 'APPROVED') {
      report.approved_by = actor
      report.approved_at = now
    }
  }

  return { study, history_entry: entry, report: report ?? null }
}

/* --------------------------- Ghi dữ liệu bệnh nhân / chỉ định / ca chụp (Task 7) */

const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing = fields.filter(f => str(body[f]) == null && body[f] == null)
  if (missing.length) {
    throw new ApiError(
      400, 'VALIDATION_ERROR', 'Request không hợp lệ.',
      missing.map(f => ({ field: f, issue: 'bắt buộc' })))
  }
}

function createPatient(body: Record<string, unknown>) {
  requireFields(body, ['patient_code', 'full_name', 'dob_precision', 'gender'])
  const code = str(body.patient_code)!

  // Cùng mã lỗi backend trả (service/impl/PatientServiceImpl) để Frontend xử lý giống nhau
  // ở cả hai chế độ.
  if (patients.some(p => p.patient_code.toLowerCase() === code.toLowerCase())) {
    throw new ApiError(409, 'PATIENT_DUPLICATE_CODE', `Mã bệnh nhân "${code}" đã tồn tại.`)
  }
  const bhxh = str(body.social_insurance_no)
  if (bhxh && patients.some(p => p.social_insurance_no === bhxh)) {
    throw new ApiError(
      409, 'PATIENT_SUSPECTED_DUPLICATE',
      `Mã BHXH "${bhxh}" đã gắn với một bệnh nhân khác — cần đối chiếu trước khi tạo.`)
  }

  const created = {
    id: patientSeq++,
    patient_code: code,
    his_patient_id: null,
    full_name: str(body.full_name)!,
    date_of_birth: str(body.date_of_birth),
    dob_precision: (str(body.dob_precision) ?? 'DAY') as 'DAY' | 'MONTH' | 'YEAR',
    gender: (str(body.gender) ?? 'U') as 'M' | 'F' | 'O' | 'U',
    social_insurance_no: bhxh,
    phone: str(body.phone),
    address: str(body.address),
    health_check_code: null,
  }
  patients.push(created)
  return patientDto(created.id)
}

function updatePatient(patientId: number, body: Record<string, unknown>) {
  const patient = patients.find(p => p.id === patientId)
  if (!patient) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Không tìm thấy bệnh nhân.')

  // PATCH là cập nhật từng phần: chỉ ghi đè trường thực sự được gửi lên.
  if ('full_name' in body && str(body.full_name)) patient.full_name = str(body.full_name)!
  if ('date_of_birth' in body) patient.date_of_birth = str(body.date_of_birth)
  if ('dob_precision' in body && str(body.dob_precision)) {
    patient.dob_precision = str(body.dob_precision) as 'DAY' | 'MONTH' | 'YEAR'
  }
  if ('gender' in body && str(body.gender)) patient.gender = str(body.gender) as 'M' | 'F' | 'O' | 'U'
  if ('social_insurance_no' in body) patient.social_insurance_no = str(body.social_insurance_no)
  if ('phone' in body) patient.phone = str(body.phone)
  if ('address' in body) patient.address = str(body.address)
  return patientDto(patient.id)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function nextOrderCode(now: Date) {
  const prefix = `PH${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const seq = orders.filter(o => o.order_code.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(3, '0')}`
}

function nextAccessionNumber(now: Date) {
  const prefix = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const seq = studies.filter(s => s.accession_number.startsWith(prefix)).length + 1
  return `${prefix}${String(seq).padStart(5, '0')}`
}

function buildStudy(orderId: number, body: Record<string, unknown>): StudyDto {
  const serviceItemId = Number(body.service_item_id)
  if (!SERVICE_ITEMS.some(s => s.id === serviceItemId)) {
    throw new ApiError(422, 'STUDY_SERVICE_ITEM_NOT_FOUND', 'Dịch vụ chụp không tồn tại.')
  }
  const deviceId = body.device_id == null ? null : Number(body.device_id)
  if (deviceId != null && !DEVICES.some(d => d.id === deviceId)) {
    throw new ApiError(422, 'STUDY_DEVICE_NOT_FOUND', 'Máy chụp không tồn tại.')
  }
  const now = new Date()
  const study: StudyDto = {
    id: studySeq++,
    accession_number: nextAccessionNumber(now),
    order_id: orderId,
    service_item_id: serviceItemId,
    device_id: deviceId,
    status: 'SCHEDULED',
    study_instance_uid: null,
    scheduled_at: str(body.scheduled_at) ?? now.toISOString(),
    started_at: null,
    completed_at: null,
    due_at: null,
    performed_by: null,
    reading_user: null,
    approving_user: null,
  }
  studies.push(study)
  history.push({
    id: historySeq++,
    study_id: study.id,
    from_status: null,
    to_status: 'SCHEDULED',
    changed_by: userRef(currentUserId!),
    changed_at: now.toISOString(),
    reason: null,
    note: null,
  })
  return study
}

function createImagingOrder(body: Record<string, unknown>) {
  requireFields(body, ['patient_id', 'ordering_department_id', 'ordering_doctor_name', 'patient_class'])
  const patientId = Number(body.patient_id)
  if (!patients.some(p => p.id === patientId)) {
    throw new ApiError(422, 'IMAGING_ORDER_PATIENT_NOT_FOUND', 'Bệnh nhân không tồn tại.')
  }
  const departmentId = Number(body.ordering_department_id)
  if (!DEPARTMENTS.some(d => d.id === departmentId)) {
    throw new ApiError(422, 'IMAGING_ORDER_DEPARTMENT_NOT_FOUND', 'Khoa chỉ định không tồn tại.')
  }
  const studyBodies = Array.isArray(body.studies) ? (body.studies as Record<string, unknown>[]) : []
  if (studyBodies.length === 0) {
    throw new ApiError(
      400, 'VALIDATION_ERROR', 'Chỉ định phải có ít nhất một ca chụp.',
      [{ field: 'studies', issue: 'không được rỗng' }])
  }

  const now = new Date()
  const order = {
    id: orderSeq++,
    order_code: nextOrderCode(now),
    patient_id: patientId,
    visit_code: str(body.visit_code),
    source: 'MANUAL' as const,
    his_order_id: null,
    sync_status: 'NOT_SYNCED' as const,
    ordering_department_id: departmentId,
    ordering_doctor_name: str(body.ordering_doctor_name)!,
    patient_class: (str(body.patient_class) ?? 'OUTPATIENT') as 'INPATIENT' | 'OUTPATIENT',
    room: str(body.room),
    bed: str(body.bed),
    clinical_diagnosis: str(body.clinical_diagnosis),
    ordered_at: str(body.ordered_at) ?? now.toISOString(),
  }
  orders.push(order)
  for (const sb of studyBodies) buildStudy(order.id, sb)
  return order
}

function updateImagingOrder(orderId: number, body: Record<string, unknown>) {
  const order = orders.find(o => o.id === orderId)
  if (!order) throw new ApiError(404, 'IMAGING_ORDER_NOT_FOUND', 'Không tìm thấy chỉ định.')

  if ('visit_code' in body) order.visit_code = str(body.visit_code)
  if ('ordering_doctor_name' in body && str(body.ordering_doctor_name)) {
    order.ordering_doctor_name = str(body.ordering_doctor_name)!
  }
  if ('ordering_department_id' in body && body.ordering_department_id != null) {
    const departmentId = Number(body.ordering_department_id)
    if (!DEPARTMENTS.some(d => d.id === departmentId)) {
      throw new ApiError(422, 'IMAGING_ORDER_DEPARTMENT_NOT_FOUND', 'Khoa chỉ định không tồn tại.')
    }
    order.ordering_department_id = departmentId
  }
  if ('patient_class' in body && str(body.patient_class)) {
    order.patient_class = str(body.patient_class) as 'INPATIENT' | 'OUTPATIENT'
  }
  if ('room' in body) order.room = str(body.room)
  if ('bed' in body) order.bed = str(body.bed)
  if ('clinical_diagnosis' in body) order.clinical_diagnosis = str(body.clinical_diagnosis)
  return order
}

function addStudyToOrder(orderId: number, body: Record<string, unknown>) {
  const order = orders.find(o => o.id === orderId)
  if (!order) throw new ApiError(404, 'IMAGING_ORDER_NOT_FOUND', 'Không tìm thấy chỉ định.')
  requireFields(body, ['service_item_id'])
  return buildStudy(orderId, body)
}

/** `PATCH /studies/{id}` theo openapi `StudyUpdate`; `status` không đổi được ở đây. */
function updateStudy(studyId: number, body: Record<string, unknown>) {
  const study = studies.find(s => s.id === studyId)
  if (!study) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Không tìm thấy ca chụp.')

  if ('service_item_id' in body && body.service_item_id != null) {
    const id = Number(body.service_item_id)
    if (!SERVICE_ITEMS.some(s => s.id === id)) {
      throw new ApiError(422, 'STUDY_SERVICE_ITEM_NOT_FOUND', 'Dịch vụ chụp không tồn tại.')
    }
    study.service_item_id = id
  }
  if ('device_id' in body) {
    const id = body.device_id == null || body.device_id === '' ? null : Number(body.device_id)
    if (id != null && !DEVICES.some(d => d.id === id)) {
      throw new ApiError(422, 'STUDY_DEVICE_NOT_FOUND', 'Máy chụp không tồn tại.')
    }
    study.device_id = id
  }
  if ('scheduled_at' in body && str(body.scheduled_at)) study.scheduled_at = str(body.scheduled_at)!
  if ('study_instance_uid' in body) study.study_instance_uid = str(body.study_instance_uid)
  return study
}

function listImagingOrders(query: Record<string, QueryValue>) {
  const text = (v: QueryValue) => (v == null ? '' : String(v).trim().toLowerCase())
  const orderCode = text(query.order_code)
  const patientCode = text(query.patient_code)

  const matched = orders.filter(o => {
    if (orderCode && !o.order_code.toLowerCase().includes(orderCode)) return false
    if (patientCode) {
      const p = patients.find(x => x.id === o.patient_id)
      if (!p || !p.patient_code.toLowerCase().includes(patientCode)) return false
    }
    return true
  })

  const page = Number(query.page ?? 1)
  const pageSize = Number(query.page_size ?? 20)
  return {
    page,
    page_size: pageSize,
    total: matched.length,
    items: matched.slice((page - 1) * pageSize, page * pageSize),
  }
}

function listPatients(query: Record<string, QueryValue>) {
  const text = (v: QueryValue) => (v == null ? '' : String(v).trim().toLowerCase())
  const code = text(query.patient_code)
  const name = text(query.full_name)
  const bhxh = text(query.social_insurance_no)

  const matched = patients
    .filter(p => {
      if (code && !p.patient_code.toLowerCase().includes(code)) return false
      if (name && !p.full_name.toLowerCase().includes(name)) return false
      if (bhxh && !(p.social_insurance_no ?? '').toLowerCase().includes(bhxh)) return false
      return true
    })
    .map(p => patientDto(p.id))

  const page = Number(query.page ?? 1)
  const pageSize = Number(query.page_size ?? 20)
  return {
    page,
    page_size: pageSize,
    total: matched.length,
    items: matched.slice((page - 1) * pageSize, page * pageSize),
  }
}

/* ------------------------------------------------------------------- Client */

export function createMockClient(): HttpClient {
  async function handle(req: HttpRequest): Promise<unknown> {
    await delay()
    const { method, path } = req
    const query = req.query ?? {}
    let m: Record<string, string> | null

    if (method === 'POST' && path === '/auth/login') {
      const { username, password } = req.body as { username: string; password: string }
      const user = USERS.find(u => u.username === username.trim().toLowerCase())
      if (!user || password !== DEMO_PASSWORD) {
        throw new ApiError(401, 'BAD_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.')
      }
      currentUserId = user.id
      const res: LoginResponseDto = {
        access_token: `mock.${user.username}.${Date.now()}`,
        token_type: 'Bearer',
        expires_in: 3600,
        user,
      }
      return res
    }

    if (method === 'POST' && path === '/auth/logout') {
      currentUserId = null
      return undefined
    }

    if (method === 'GET' && path === '/auth/me') {
      requireAuth()
      return USERS.find(u => u.id === currentUserId)!
    }

    requireAuth()

    if (method === 'GET' && path === '/departments') return DEPARTMENTS
    if (method === 'GET' && path === '/devices') return DEVICES
    if (method === 'GET' && path === '/service-items') return SERVICE_ITEMS

    /* ------------------------------- Ghi dữ liệu: bệnh nhân và chỉ định (Task 7) */

    if (method === 'POST' && path === '/patients') {
      return createPatient(req.body as Record<string, unknown>)
    }

    if ((m = matchPath('/patients/:id', path)) && method === 'PATCH') {
      return updatePatient(Number(m.id), req.body as Record<string, unknown>)
    }

    if (method === 'POST' && path === '/imaging-orders') {
      return createImagingOrder(req.body as Record<string, unknown>)
    }

    if ((m = matchPath('/imaging-orders/:id', path)) && method === 'PATCH') {
      return updateImagingOrder(Number(m.id), req.body as Record<string, unknown>)
    }

    if ((m = matchPath('/imaging-orders/:id/studies', path)) && method === 'POST') {
      return addStudyToOrder(Number(m.id), req.body as Record<string, unknown>)
    }

    if ((m = matchPath('/studies/:id', path)) && method === 'PATCH') {
      return updateStudy(Number(m.id), req.body as Record<string, unknown>)
    }

    if (method === 'GET' && path === '/imaging-orders') {
      return listImagingOrders(query)
    }

    if (method === 'GET' && path === '/patients') {
      return listPatients(query)
    }

    if (method === 'GET' && path === '/studies') return listStudies(query)

    if (method === 'GET' && path === '/studies/status-counts') {
      const by: Record<string, number> = {}
      for (const s of studies) by[s.status] = (by[s.status] ?? 0) + 1
      const res: StatusCountsDto = { total: studies.length, by_status: by }
      return res
    }

    if ((m = matchPath('/studies/:id/status-history', path)) && method === 'GET') {
      const id = Number(m.id)
      return history.filter(h => h.study_id === id).sort((a, b) => b.id - a.id)
    }

    if ((m = matchPath('/studies/:id/reports/current', path))) {
      const id = Number(m.id)
      if (method === 'GET') {
        const r = currentReportOf(id)
        if (!r) throw new ApiError(404, 'REPORT_NOT_FOUND', 'Ca chụp chưa có báo cáo.')
        return r
      }
      if (method === 'PUT') {
        const study = studies.find(s => s.id === id)
        if (!study) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Không tìm thấy ca chụp.')
        if (study.status !== 'READING') {
          throw new ApiError(409, 'STUDY_NOT_READING', 'Chỉ sửa được báo cáo khi ca đang ở trạng thái Đang đọc.')
        }
        const body = req.body as ReportWriteDto
        let r = currentReportOf(id)
        if (!r) {
          r = {
            id: reportSeq++, study_id: id, version: 1, status: 'DRAFT', origin: 'MANUAL',
            technique: null, findings: null, diagnosis: null, conclusion: null, recommendation: null,
            created_by: userRef(currentUserId!), created_at: new Date().toISOString(),
            approved_by: null, approved_at: null,
          }
          reports.push(r)
        }
        Object.assign(r, body)
        return r
      }
    }

    if ((m = matchPath('/studies/:id/transitions', path)) && method === 'POST') {
      return applyTransition(Number(m.id), req.body as TransitionRequestDto)
    }

    if ((m = matchPath('/studies/:id/viewer-link', path)) && method === 'GET') {
      const id = Number(m.id)
      const s = studies.find(x => x.id === id)
      if (!s) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Không tìm thấy ca chụp.')
      if (!s.study_instance_uid) {
        throw new ApiError(422, 'STUDY_NO_DICOM_IMAGE', 'Ca chụp chưa có ảnh trong PACS (study_instance_uid is null).')
      }
      const base = import.meta.env.VITE_OHIF_BASE_URL || 'http://localhost:8043'
      // UID phai nam trong PATH ("/viewer/<uid>"), KHONG phai query string ("?StudyInstanceUIDs=").
      // Ban OHIF dang chay (ohif/viewer:v4.12.51.21579) dung route cu "ConnectedStandaloneRouting"
      // (schema "servers.dicomWeb", xem deploy/docker/ohif-app-config.js) - route nay chi khop path
      // "/viewer/:studyInstanceUids"; dang "?StudyInstanceUIDs=" roi ve route khac (doc file don le
      // qua "?url="), gay loi "No URL was specified" (phat hien bang tay 2026-11-09, xem
      // doc/07-pacs-dicom.md).
      const viewerUrl = `${base.replace(/\/$/, '')}/viewer/${s.study_instance_uid}`
      const order = orders.find(o => o.id === s.order_id)
      console.info('[mock] audit_log VIEW_IMAGE', {
        study_id: s.id,
        patient_id: order?.patient_id ?? 1,
        study_instance_uid: s.study_instance_uid,
        viewer_url: viewerUrl,
      })
      return {
        study_id: s.id,
        patient_id: order?.patient_id ?? 1,
        study_instance_uid: s.study_instance_uid,
        viewer_url: viewerUrl,
      }
    }

    if ((m = matchPath('/studies/:id', path)) && method === 'GET') {
      const s = studies.find(x => x.id === Number(m!.id))
      if (!s) throw new ApiError(404, 'STUDY_NOT_FOUND', 'Không tìm thấy ca chụp.')
      return rowOf(s)
    }

    if ((m = matchPath('/patients/:id/print-events', path)) && method === 'POST') {
      // Backend ghi audit_log action PRINT kem patient_id; mock chi ghi ra console de kiem chung.
      const body = req.body as { study_id: number; sections: string[] }
      const patient = patients.find(p => p.id === Number(m!.id))
      if (!patient) throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Không tìm thấy bệnh nhân.')
      console.info('[mock] audit_log PRINT', {
        patient_id: patient.id,
        patient_code: patient.patient_code,
        study_id: body.study_id,
        sections: body.sections,
      })
      return undefined
    }

    if (method === 'POST' && path === '/patients/export-events') {
      const body = req.body as {
        target: 'PATIENTS' | 'STUDIES'
        mode: 'EXPORT' | 'PRINT'
        row_count?: number
        patient_id?: number | null
      }
      if (body.patient_id != null && !patients.some(p => p.id === body.patient_id)) {
        throw new ApiError(404, 'PATIENT_NOT_FOUND', 'Không tìm thấy bệnh nhân.')
      }
      console.info('[mock] audit_log EXPORT', {
        target: body.target,
        mode: body.mode,
        row_count: body.row_count ?? 0,
        patient_id: body.patient_id ?? null,
      })
      return undefined
    }

    if ((m = matchPath('/imaging-orders/:id/clinical-snapshot', path)) && method === 'GET') {
      const id = Number(m.id)
      const payload = CLINICAL_SNAPSHOTS[id]
      if (!payload) throw new ApiError(404, 'SNAPSHOT_NOT_FOUND', 'Chỉ định này chưa có snapshot lâm sàng.')
      const res: ClinicalSnapshotDto = {
        order_id: id,
        source: 'SEED',
        fetched_at: '2026-10-31T03:00:00Z',
        payload: payload as unknown as Record<string, unknown>,
      }
      return res
    }

    throw new ApiError(404, 'NOT_FOUND', `Mock server chưa cài endpoint ${method} ${path}.`)
  }

  function escapeCsvCell(raw: string | number | null | undefined): string {
    if (raw == null || raw === '') return ''
    let val = String(raw)
    const first = val.charAt(0)
    if (first === '=' || first === '+' || first === '-' || first === '@') {
      val = `'${val}`
    }
    if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map(r => r.map(escapeCsvCell).join(',')),
    ]
    return `\uFEFF${lines.join('\r\n')}\r\n`
  }

  function stampFileDate(): string {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
  }

  function formatAgeCell(age: number | null | undefined, approximate?: boolean): string {
    if (age == null) return '—'
    return approximate ? `~${age}` : String(age)
  }

  return {
    request: <T,>(req: HttpRequest) => handle(req) as Promise<T>,
    requestBlob: async (req: HttpRequest) => {
      await delay()
      requireAuth()
      const query = req.query ?? {}

      if (req.method === 'GET' && req.path === '/studies/export') {
        const page = listStudies({ ...query, page: 1, page_size: 5000 })
        const items = page.items
        const distinctPatientIds = Array.from(new Set(items.map(r => r.patient.id)))
        const singlePatientId = distinctPatientIds.length === 1 ? distinctPatientIds[0] : null

        console.info('[mock] audit_log EXPORT', {
          entity_type: 'STUDY',
          row_count: items.length,
          patient_id: singlePatientId,
        })

        const csv = buildCsv(
          [
            'STT', 'Mã hồ sơ', 'Trạng thái', 'Mã phiếu', 'Mã LSVV', 'Loại BN',
            'Mã bệnh nhân', 'Họ tên', 'Ngày sinh', 'Tuổi', 'Giới tính', 'Số BHXH',
            'Dịch vụ chỉ định', 'Modality', 'Bộ phận chụp', 'Máy chụp',
            'Bác sĩ chỉ định', 'Chẩn đoán lâm sàng', 'Kết luận',
            'Thời gian lên lịch', 'Thời gian bắt đầu', 'Thời gian hoàn thành',
          ],
          items.map((r, i) => [
            i + 1,
            r.study.accession_number,
            r.study.status,
            r.order.order_code,
            r.order.visit_code,
            r.order.patient_class,
            r.patient.patient_code,
            r.patient.full_name,
            r.patient.date_of_birth,
            formatAgeCell(r.patient.age, r.patient.age_approximate),
            r.patient.gender,
            r.patient.social_insurance_no,
            r.service_item.name,
            r.service_item.modality,
            r.service_item.body_part,
            r.device?.name ?? '',
            r.order.ordering_doctor_name,
            r.order.clinical_diagnosis,
            r.report_summary?.conclusion ?? '',
            r.study.scheduled_at,
            r.study.started_at,
            r.study.completed_at,
          ]),
        )
        return {
          blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          filename: `danh-sach-ca-chup_${stampFileDate()}.csv`,
        }
      }

      if (req.method === 'GET' && req.path === '/patients/export') {
        const q = String(query.q ?? '').trim().toLowerCase()
        const code = String(query.patient_code ?? '').trim().toLowerCase()
        const name = String(query.full_name ?? '').trim().toLowerCase()

        const matched = patients.map(p => patientDto(p.id)).filter(p => {
          if (code && !p.patient_code.toLowerCase().includes(code)) return false
          if (name && !p.full_name.toLowerCase().includes(name)) return false
          if (q) {
            const hit = p.patient_code.toLowerCase().includes(q)
              || p.full_name.toLowerCase().includes(q)
              || (p.social_insurance_no ?? '').toLowerCase().includes(q)
            if (!hit) return false
          }
          return true
        })

        const singlePatientId = matched.length === 1 ? matched[0].id : null
        console.info('[mock] audit_log EXPORT', {
          entity_type: 'PATIENT',
          row_count: matched.length,
          patient_id: singlePatientId,
        })

        const csv = buildCsv(
          [
            'STT', 'Mã bệnh nhân', 'Mã HIS', 'Họ tên', 'Ngày sinh',
            'Độ chính xác NS', 'Tuổi', 'Giới tính', 'Số BHXH', 'Điện thoại', 'Địa chỉ',
          ],
          matched.map((p, i) => [
            i + 1,
            p.patient_code,
            p.his_patient_id,
            p.full_name,
            p.date_of_birth,
            p.dob_precision,
            formatAgeCell(p.age, p.age_approximate),
            p.gender,
            p.social_insurance_no,
            p.phone,
            p.address,
          ]),
        )
        return {
          blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          filename: `danh-sach-benh-nhan_${stampFileDate()}.csv`,
        }
      }

      throw new ApiError(
        501,
        'MOCK_NO_PDF',
        'Mock server không dựng được PDF. Chuyển VITE_API_MODE=live để tải phiếu từ backend, hoặc dùng "In / Lưu PDF" của trình duyệt.',
      )
    },
  }
}
