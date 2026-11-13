import { api } from '@/shared/api/client'
import type {
  ImagingOrderDto, PageDto, PatientDto, StudyDto, TransitionRequestDto, TransitionResultDto,
} from '@/shared/api/dto'
import {
  toImagingOrder, toPage, toPatient, toReport, toStatusHistoryEntry, toStudy,
} from '@/shared/api/mappers'
import type {
  DobPrecision, Gender, ImagingOrder, Page, Patient, PatientClass, Report, StatusHistoryEntry,
  Study, StudyStatus,
} from '@/shared/lib/types'

/* --------------------------------------------------------------- Bệnh nhân */

/** Thân `POST /patients` (backend: `dto.request.PatientCreateRequest`, JSON snake_case). */
export interface PatientCreateInput {
  patientCode: string
  fullName: string
  dateOfBirth: string | null
  dobPrecision: DobPrecision
  gender: Gender
  socialInsuranceNo: string | null
  phone: string | null
  address: string | null
}

/** Thân `PATCH /patients/{id}` — cập nhật từng phần; **không** đổi được `patient_code`. */
export type PatientUpdateInput = Partial<Omit<PatientCreateInput, 'patientCode'>>

const patientBody = (input: PatientCreateInput | PatientUpdateInput) => ({
  patient_code: (input as PatientCreateInput).patientCode,
  full_name: input.fullName,
  date_of_birth: input.dateOfBirth,
  dob_precision: input.dobPrecision,
  gender: input.gender,
  social_insurance_no: input.socialInsuranceNo,
  phone: input.phone,
  address: input.address,
})

/** `POST /patients` — trả `409 PATIENT_DUPLICATE_CODE` khi trùng mã, `409 PATIENT_SUSPECTED_DUPLICATE` khi trùng BHXH khác người. */
export async function createPatient(input: PatientCreateInput): Promise<Patient> {
  const dto = await api.request<PatientDto>({ method: 'POST', path: '/patients', body: patientBody(input) })
  return toPatient(dto)
}

export async function updatePatient(patientId: number, input: PatientUpdateInput): Promise<Patient> {
  const body = patientBody(input)
  delete (body as Record<string, unknown>).patient_code
  const dto = await api.request<PatientDto>({ method: 'PATCH', path: `/patients/${patientId}`, body })
  return toPatient(dto)
}

export async function searchPatients(
  query: { patientCode?: string; fullName?: string; socialInsuranceNo?: string },
  signal?: AbortSignal,
): Promise<Page<Patient>> {
  const dto = await api.request<PageDto<PatientDto>>({
    method: 'GET',
    path: '/patients',
    query: {
      patient_code: query.patientCode,
      full_name: query.fullName,
      social_insurance_no: query.socialInsuranceNo,
      page: 1,
      page_size: 20,
    },
    signal,
  })
  return toPage(dto, toPatient)
}

/* ---------------------------------------------------------------- Chỉ định */

/** Một ca chụp trong thân `POST /imaging-orders` (backend: `dto.request.StudyCreateRequest`). */
export interface StudyCreateInput {
  serviceItemId: number
  deviceId: number | null
  /** ISO local date-time, ví dụ `2026-11-12T09:30:00`. */
  scheduledAt: string
}

/** Thân `POST /imaging-orders` — tạo chỉ định **kèm ít nhất một ca chụp** (`@NotEmpty studies`). */
export interface ImagingOrderCreateInput {
  patientId: number
  visitCode: string | null
  orderingDepartmentId: number
  orderingDoctorName: string
  patientClass: PatientClass
  room: string | null
  bed: string | null
  clinicalDiagnosis: string | null
  orderedAt: string | null
  studies: StudyCreateInput[]
}

export type ImagingOrderUpdateInput = Partial<Omit<ImagingOrderCreateInput, 'patientId' | 'studies' | 'orderedAt'>>

const studyBody = (s: StudyCreateInput) => ({
  service_item_id: s.serviceItemId,
  device_id: s.deviceId,
  scheduled_at: s.scheduledAt,
})

export async function createImagingOrder(input: ImagingOrderCreateInput): Promise<ImagingOrder> {
  const dto = await api.request<ImagingOrderDto>({
    method: 'POST',
    path: '/imaging-orders',
    body: {
      patient_id: input.patientId,
      visit_code: input.visitCode,
      ordering_department_id: input.orderingDepartmentId,
      ordering_doctor_name: input.orderingDoctorName,
      patient_class: input.patientClass,
      room: input.room,
      bed: input.bed,
      clinical_diagnosis: input.clinicalDiagnosis,
      ordered_at: input.orderedAt,
      studies: input.studies.map(studyBody),
    },
  })
  return toImagingOrder(dto)
}

export async function updateImagingOrder(orderId: number, input: ImagingOrderUpdateInput): Promise<ImagingOrder> {
  const dto = await api.request<ImagingOrderDto>({
    method: 'PATCH',
    path: `/imaging-orders/${orderId}`,
    body: {
      visit_code: input.visitCode,
      ordering_department_id: input.orderingDepartmentId,
      ordering_doctor_name: input.orderingDoctorName,
      patient_class: input.patientClass,
      room: input.room,
      bed: input.bed,
      clinical_diagnosis: input.clinicalDiagnosis,
    },
  })
  return toImagingOrder(dto)
}

/** `POST /imaging-orders/{id}/studies` — thêm một ca chụp vào chỉ định đã có. */
export async function addStudyToOrder(orderId: number, input: StudyCreateInput): Promise<Study> {
  const dto = await api.request<StudyDto>({
    method: 'POST',
    path: `/imaging-orders/${orderId}/studies`,
    body: studyBody(input),
  })
  return toStudy(dto)
}

/* ---------------------------------------------------------------- Ca chụp */

/** Thân `PATCH /studies/{id}` (openapi `StudyUpdate`). **Không** đổi `status` ở đây — dùng `/transitions`. */
export interface StudyUpdateInput {
  serviceItemId?: number
  deviceId?: number | null
  scheduledAt?: string
  /** Chỉ `TECHNICIAN` và `ADMIN` được đặt (`doc/06-rbac-matrix.md` mục 5). */
  studyInstanceUid?: string | null
}

/**
 * `PATCH /studies/{id}` — đã có trong `openapi.yaml` (operationId `updateStudy`) nhưng backend
 * **chưa cài** tính tới 2026-11-12 (KAN-34); ở chế độ `live` sẽ trả 404/405 cho tới khi xong.
 * Mock server đã cài theo đúng contract nên luồng sửa máy chụp / điền `study_instance_uid`
 * chạy thử được ngay.
 */
export async function updateStudy(studyId: number, input: StudyUpdateInput): Promise<Study> {
  const body: Record<string, unknown> = {}
  if ('serviceItemId' in input) body.service_item_id = input.serviceItemId
  if ('deviceId' in input) body.device_id = input.deviceId
  if ('scheduledAt' in input) body.scheduled_at = input.scheduledAt
  if ('studyInstanceUid' in input) body.study_instance_uid = input.studyInstanceUid
  const dto = await api.request<StudyDto>({ method: 'PATCH', path: `/studies/${studyId}`, body })
  return toStudy(dto)
}

export async function searchImagingOrders(
  query: { orderCode?: string; patientCode?: string },
  signal?: AbortSignal,
): Promise<Page<ImagingOrder>> {
  const dto = await api.request<PageDto<ImagingOrderDto>>({
    method: 'GET',
    path: '/imaging-orders',
    query: {
      order_code: query.orderCode,
      patient_code: query.patientCode,
      page: 1,
      page_size: 20,
    },
    signal,
  })
  return toPage(dto, toImagingOrder)
}

/* ------------------------------------------------------- Chuyển trạng thái */

export interface TransitionResult {
  study: Study
  historyEntry: StatusHistoryEntry
  report: Report | null
}

/**
 * `POST /studies/{id}/transitions` — nguồn duy nhất của mọi bước T2…T10 trong Frontend.
 * Backend kiểm lại vai trò (403) và điều kiện nghiệp vụ (422/409); Frontend chỉ ẩn/khóa nút.
 */
export async function transitionStudy(
  studyId: number,
  toStatus: StudyStatus,
  reason: string | null,
): Promise<TransitionResult> {
  const body: TransitionRequestDto = { to_status: toStatus, reason }
  const dto = await api.request<TransitionResultDto>({
    method: 'POST',
    path: `/studies/${studyId}/transitions`,
    body,
  })
  return {
    study: toStudy(dto.study),
    historyEntry: toStatusHistoryEntry(dto.history_entry),
    report: dto.report ? toReport(dto.report) : null,
  }
}
