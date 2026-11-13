import { useEffect, useMemo, useState } from 'react'
import { useReferenceData } from '@/features/worklist/hooks/useWorklist'
import { ApiError } from '@/shared/api/http'
import { can, deniedReason } from '@/shared/lib/auth'
import { genderLabel } from '@/shared/lib/format'
import type { AppUser, Gender, PatientClass, WorklistRow } from '@/shared/lib/types'
import { Button, Input, Modal, Select } from '@/shared/ui/controls'
import { Download, Warning } from '@/shared/ui/Icon'
import { updateImagingOrder, updatePatient, updateStudy } from '../api/studiesApi'
import { messageFor } from './AddStudyModal'

/** Nhóm dữ liệu quyết định trường được gửi tới endpoint nào khi lưu. */
type Target = 'patient' | 'order' | 'study'

interface FieldDef {
  key: keyof FormState
  label: string
  target: Target
  /** Trường định danh bệnh nhân — `CLINICIAN` chỉ xem (`doc/06-rbac-matrix.md` mục 5, D24). */
  identityField?: boolean
  type?: 'text' | 'date' | 'select'
  options?: { value: string; label: string }[]
  /** Hiển thị giá trị cho bảng so sánh (mặc định là chính chuỗi trong form). */
  display?: (value: string) => string
}

const IDENTITY_LOCK_TOOLTIP = 'Chỉ KTV hoặc Admin được sửa trường này'
const STUDY_FIELD_TOOLTIP =
  'Lưu qua PATCH /studies/{id} — đã có trong openapi.yaml, backend đang làm (KAN-34)'

/**
 * "Cập nhật ca chụp" (IN-04) — so sánh thông tin hiện tại ↔ thông tin cập nhật.
 *
 * Lưu thật (Task 7): trường của bệnh nhân đi `PATCH /patients/{id}`, trường của chỉ định đi
 * `PATCH /imaging-orders/{id}`. Trường của **ca chụp** (máy chụp, StudyInstanceUID) sửa được
 * trên giao diện để xem trước thay đổi (Task 11), nhưng **chưa lưu được** vì `openapi.yaml`
 * chưa có `PATCH /studies/{id}` — xem KAN-34.
 */
export function UpdateStudyModal({ open, onClose, row, user, onSaved }: {
  open: boolean
  onClose: () => void
  row: WorklistRow | null
  user: AppUser
  onSaved: () => void
}) {
  const reference = useReferenceData()
  const devices = reference.data?.devices ?? []

  // CLINICIAN không có ADMIN/TECHNICIAN: khóa trường định danh, chỉ xem (D24).
  const lockIdentityFields = !user.roles.some(r => r === 'ADMIN' || r === 'TECHNICIAN')
  const allowed = can(user, 'patient.update')

  const initial = useMemo(() => (row ? formOf(row) : emptyForm()), [row])
  const [form, setForm] = useState<FormState>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  /*
   * Chỉ nạp lại form khi mở modal hoặc đổi sang ca khác — **không** phụ thuộc `initial`.
   * `initial` được tính lại mỗi lần `row` đổi, kể cả ngay sau khi lưu xong (worklist tải lại);
   * nếu để nó trong deps thì thông báo "chưa lưu được máy chụp" vừa hiện đã bị xóa.
   * Giữ nguyên form sau khi lưu còn cho bảng so sánh tự rút lại đúng phần chưa lưu được.
   */
  const studyId = row?.study.id
  useEffect(() => {
    if (!open) return
    setForm(row ? formOf(row) : emptyForm())
    setError(null)
    setNotice(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studyId])

  const fields = useMemo<FieldDef[]>(() => [
    { key: 'patientCode', label: 'Mã bệnh nhân', target: 'patient', identityField: true },
    { key: 'fullName', label: 'Họ tên', target: 'patient', identityField: true },
    { key: 'dateOfBirth', label: 'Ngày sinh', target: 'patient', identityField: true, type: 'date' },
    {
      key: 'gender', label: 'Giới tính', target: 'patient', identityField: true, type: 'select',
      options: [
        { value: 'M', label: 'Nam' }, { value: 'F', label: 'Nữ' },
        { value: 'O', label: 'Khác' }, { value: 'U', label: 'Không rõ' },
      ],
      display: v => genderLabel(v as Gender),
    },
    { key: 'socialInsuranceNo', label: 'Mã BHXH', target: 'patient', identityField: true },
    { key: 'phone', label: 'Điện thoại', target: 'patient' },
    { key: 'address', label: 'Địa chỉ', target: 'patient' },
    { key: 'visitCode', label: 'Mã LSVV', target: 'order' },
    { key: 'orderingDoctorName', label: 'Bác sĩ chỉ định', target: 'order' },
    {
      key: 'patientClass', label: 'Loại bệnh nhân', target: 'order', type: 'select',
      options: [{ value: 'OUTPATIENT', label: 'Ngoại trú' }, { value: 'INPATIENT', label: 'Nội trú' }],
      display: v => (v === 'INPATIENT' ? 'Nội trú' : 'Ngoại trú'),
    },
    { key: 'room', label: 'Buồng', target: 'order' },
    { key: 'bed', label: 'Giường', target: 'order' },
    { key: 'clinicalDiagnosis', label: 'Chẩn đoán ban đầu', target: 'order' },
    {
      // Task 11: ô đổi máy chụp, nguồn dữ liệu từ GET /devices.
      key: 'deviceId', label: 'Máy chụp', target: 'study', type: 'select',
      options: devices.map(d => ({ value: String(d.id), label: `${d.name} (${d.modality})` })),
      display: v => (v ? devices.find(d => String(d.id) === v)?.name ?? `Máy #${v}` : '—'),
    },
    { key: 'studyInstanceUid', label: 'StudyInstanceUID', target: 'study' },
  ], [devices])

  // Task 11: chỉ những trường thực sự đổi mới vào bảng so sánh.
  const changed = useMemo(
    () => fields.filter(f => form[f.key] !== initial[f.key]),
    [fields, form, initial],
  )

  if (!open || !row) return null

  const isLocked = (f: FieldDef) =>
    (f.identityField && lockIdentityFields) || f.key === 'patientCode' || !allowed

  const lockReason = (f: FieldDef) => {
    if (!allowed) return deniedReason('patient.update')
    if (f.key === 'patientCode') return 'Mã bệnh nhân là khóa đối chiếu, không đổi được sau khi tạo'
    if (f.identityField && lockIdentityFields) return IDENTITY_LOCK_TOOLTIP
    return undefined
  }

  const show = (f: FieldDef, value: string) => {
    const text = f.display ? f.display(value) : value
    return text.trim() === '' ? '—' : text
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const patientChanges = changed.filter(f => f.target === 'patient' && f.key !== 'patientCode')
      const orderChanges = changed.filter(f => f.target === 'order')
      const studyChanges = changed.filter(f => f.target === 'study')

      if (patientChanges.length) {
        await updatePatient(row.patient.id, {
          fullName: form.fullName.trim(),
          dateOfBirth: form.dateOfBirth || null,
          gender: form.gender as Gender,
          socialInsuranceNo: form.socialInsuranceNo.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        })
      }

      if (orderChanges.length) {
        await updateImagingOrder(row.order.id, {
          visitCode: form.visitCode.trim() || null,
          orderingDoctorName: form.orderingDoctorName.trim(),
          patientClass: form.patientClass as PatientClass,
          room: form.room.trim() || null,
          bed: form.bed.trim() || null,
          clinicalDiagnosis: form.clinicalDiagnosis.trim() || null,
        })
      }

      if (studyChanges.length) {
        try {
          await updateStudy(row.study.id, {
            deviceId: form.deviceId ? Number(form.deviceId) : null,
            studyInstanceUid: form.studyInstanceUid.trim() || null,
          })
        } catch (err) {
          // `PATCH /studies/{id}` có trong openapi nhưng backend chưa cài (KAN-34): ở chế độ live
          // sẽ 404/405. Nói rõ phần nào chưa lưu được thay vì im lặng bỏ qua.
          if (err instanceof ApiError && (err.status === 404 || err.status === 405)) {
            onSaved()
            setNotice(
              `Đã lưu thông tin bệnh nhân và chỉ định. Chưa lưu được ${studyChanges.map(f => f.label).join(', ')} `
              + '— backend chưa cài PATCH /studies/{id} (KAN-34).')
            return
          }
          throw err
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? messageFor(err) : 'Không gọi được máy chủ, thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cập nhật ca chụp"
      width={720}
      footer={
        <>
          <span className="mr-auto text-[11px] text-ink-4">
            {changed.length === 0 ? 'Chưa có thay đổi nào' : `${changed.length} trường đã đổi`}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button
            icon={<Download size={12} />}
            disabled={busy || !allowed || changed.length === 0}
            title={allowed ? undefined : deniedReason('patient.update')}
            onClick={() => void save()}
          >
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </>
      }
    >
      {!allowed && (
        <div className="mb-3 flex items-start gap-1.5 rounded-md border border-[#f6e0b5] bg-[#fdf9ef] px-2.5 py-2 text-[11.5px] text-[#92400e]">
          <Warning size={13} className="mt-px shrink-0" />
          Bạn chỉ xem được màn này. {deniedReason('patient.update')}.
        </div>
      )}

      <table className="w-full border-collapse overflow-hidden rounded-md border border-line text-[12px]">
        <thead>
          <tr className="bg-[#e7eefb] text-left text-[11.5px] font-semibold text-[#1e3a6b]">
            <th className="w-[150px] border-b border-brand-100 px-2.5 py-2">Trường thông tin</th>
            <th className="w-[210px] border-b border-brand-100 px-2.5 py-2">Thông tin hiện tại</th>
            <th className="border-b border-brand-100 px-2.5 py-2">Thông tin cập nhật</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(f => {
            const isChanged = form[f.key] !== initial[f.key]
            const locked = isLocked(f)
            return (
              <tr key={f.key} className={isChanged ? 'bg-[#fdf9ef]' : 'bg-white'}>
                <td className="border-b border-line-soft px-2.5 py-2 text-ink-3">
                  {f.label}
                  {f.target === 'study' && <span className="ml-1 text-[10px] text-ink-4">(ca chụp)</span>}
                </td>
                <td className="border-b border-line-soft px-2.5 py-2 text-ink-2">{show(f, initial[f.key])}</td>
                <td className="border-b border-line-soft px-2.5 py-1.5">
                  {f.type === 'select' ? (
                    <Select
                      value={form[f.key]}
                      disabled={locked}
                      title={lockReason(f) ?? (f.target === 'study' ? STUDY_FIELD_TOOLTIP : undefined)}
                      onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                      options={f.options ?? []}
                      placeholder={f.key === 'deviceId' ? 'Chưa gán máy' : undefined}
                    />
                  ) : (
                    <Input
                      type={f.type === 'date' ? 'date' : 'text'}
                      value={form[f.key]}
                      disabled={locked}
                      title={lockReason(f) ?? (f.target === 'study' ? STUDY_FIELD_TOOLTIP : undefined)}
                      placeholder={`Nhập ${f.label.toLowerCase()}`}
                      onChange={e => setForm(s => ({ ...s, [f.key]: e.target.value }))}
                    />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Task 11: bảng so sánh chỉ gồm trường đã đổi, xem trước khi bấm Lưu. */}
      {changed.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-md border border-[#f6e0b5]">
          <div className="flex items-center gap-1.5 bg-[#fdf9ef] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#92400e]">
            <Warning size={13} />
            Những thay đổi sẽ lưu ({changed.length})
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-white text-left text-[11px] font-semibold text-ink-4">
                <th className="w-[150px] border-b border-line-soft px-2.5 py-1.5">Trường</th>
                <th className="border-b border-line-soft px-2.5 py-1.5">Hiện tại</th>
                <th className="border-b border-line-soft px-2.5 py-1.5">Sau khi lưu</th>
              </tr>
            </thead>
            <tbody>
              {changed.map(f => (
                <tr key={f.key} className="bg-white">
                  <td className="border-b border-line-soft px-2.5 py-1.5 text-ink-3">{f.label}</td>
                  <td className="border-b border-line-soft px-2.5 py-1.5 text-ink-4 line-through">
                    {show(f, initial[f.key])}
                  </td>
                  <td className="border-b border-line-soft px-2.5 py-1.5 font-medium text-ink">
                    {show(f, form[f.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[11px] text-ink-4">
        Mã phiếu {row.order.orderCode} · Mã hồ sơ {row.study.accessionNumber}
      </div>

      {notice && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-[#f6e0b5] bg-[#fdf9ef] px-2.5 py-2 text-[11.5px] text-[#92400e]">
          <Warning size={13} className="mt-px shrink-0" />
          {notice}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-1.5 rounded-md border border-[#f7cfcf] bg-[#fdf2f2] px-2.5 py-2 text-[11.5px] text-[#c81e1e]">
          <Warning size={13} className="mt-px shrink-0" />
          {error}
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ Nội bộ */

interface FormState {
  patientCode: string
  fullName: string
  dateOfBirth: string
  gender: string
  socialInsuranceNo: string
  phone: string
  address: string
  visitCode: string
  orderingDoctorName: string
  patientClass: string
  room: string
  bed: string
  clinicalDiagnosis: string
  deviceId: string
  studyInstanceUid: string
}

const emptyForm = (): FormState => ({
  patientCode: '', fullName: '', dateOfBirth: '', gender: 'U', socialInsuranceNo: '', phone: '',
  address: '', visitCode: '', orderingDoctorName: '', patientClass: 'OUTPATIENT', room: '', bed: '',
  clinicalDiagnosis: '', deviceId: '', studyInstanceUid: '',
})

/** `2026-08-09T…` → `2026-08-09` cho input[type=date]. */
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function formOf(row: WorklistRow): FormState {
  return {
    patientCode: row.patient.patientCode,
    fullName: row.patient.fullName,
    dateOfBirth: dateInput(row.patient.dateOfBirth),
    gender: row.patient.gender,
    socialInsuranceNo: row.patient.socialInsuranceNo ?? '',
    phone: row.patient.phone ?? '',
    address: row.patient.address ?? '',
    visitCode: row.order.visitCode ?? '',
    orderingDoctorName: row.order.orderingDoctorName,
    patientClass: row.order.patientClass,
    room: row.order.room ?? '',
    bed: row.order.bed ?? '',
    clinicalDiagnosis: row.order.clinicalDiagnosis ?? '',
    deviceId: row.study.deviceId == null ? '' : String(row.study.deviceId),
    studyInstanceUid: row.study.studyInstanceUid ?? '',
  }
}
