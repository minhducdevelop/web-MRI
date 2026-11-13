import { useEffect, useMemo, useState } from 'react'
import { useReferenceData } from '@/features/worklist/hooks/useWorklist'
import { ApiError } from '@/shared/api/http'
import { can, deniedReason } from '@/shared/lib/auth'
import { formatDob } from '@/shared/lib/format'
import type { AppUser, DobPrecision, Gender, Patient, PatientClass } from '@/shared/lib/types'
import { Button, Checkbox, Input, Modal, Radio, Select, cx } from '@/shared/ui/controls'
import { Plus, Search, Warning } from '@/shared/ui/Icon'
import { createImagingOrder, createPatient, searchPatients } from '../api/studiesApi'

/**
 * "THÊM CA CHỤP" (IN-01/02/03) — nay gửi dữ liệu thật:
 * `POST /patients` (khi tạo bệnh nhân mới) rồi `POST /imaging-orders` kèm một ca chụp.
 *
 * Backend bắt buộc `studies` không rỗng (`dto.request.ImagingOrderCreateRequest`), nên một lần
 * "Tạo mới" luôn sinh **một chỉ định + một ca chụp**, đúng nghĩa "thêm ca chụp".
 */
export function AddStudyModal({ open, onClose, user, onCreated }: {
  open: boolean
  onClose: () => void
  user: AppUser
  onCreated: () => void
}) {
  const reference = useReferenceData()
  const departments = reference.data?.departments ?? []
  const devices = reference.data?.devices ?? []
  const serviceItems = reference.data?.serviceItems ?? []

  const allowed = can(user, 'patient.create')

  const [newPatient, setNewPatient] = useState(true)
  const [form, setForm] = useState(() => emptyForm())
  const [picked, setPicked] = useState<Patient | null>(null)
  const [searchResults, setSearchResults] = useState<Patient[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setNewPatient(true)
    setForm(emptyForm())
    setPicked(null)
    setSearchResults(null)
    setError(null)
    setFieldErrors({})
    setBusy(false)
  }, [open])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  const missing = useMemo(() => {
    const out: string[] = []
    if (newPatient) {
      if (!form.patientCode.trim()) out.push('Mã bệnh nhân')
      if (!form.fullName.trim()) out.push('Họ tên')
    } else if (!picked) {
      out.push('Bệnh nhân')
    }
    if (!form.departmentId) out.push('Khoa chỉ định')
    if (!form.orderingDoctorName.trim()) out.push('Bác sĩ chỉ định')
    if (!form.serviceItemId) out.push('Dịch vụ chụp')
    if (!form.scheduledAt) out.push('Thời gian chụp dự kiến')
    return out
  }, [newPatient, picked, form])

  if (!open) return null

  const runSearch = async () => {
    setSearching(true)
    setError(null)
    try {
      const page = await searchPatients({ patientCode: form.searchCode.trim() || undefined })
      setSearchResults(page.items)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tìm được bệnh nhân.')
    } finally {
      setSearching(false)
    }
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      const patientId = newPatient
        ? (await createPatient({
          patientCode: form.patientCode.trim(),
          fullName: form.fullName.trim(),
          dateOfBirth: form.dateOfBirth || null,
          dobPrecision: form.dobPrecision,
          gender: form.gender,
          socialInsuranceNo: form.socialInsuranceNo.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        })).id
        : picked!.id

      await createImagingOrder({
        patientId,
        visitCode: form.visitCode.trim() || null,
        orderingDepartmentId: Number(form.departmentId),
        orderingDoctorName: form.orderingDoctorName.trim(),
        patientClass: form.patientClass,
        room: form.room.trim() || null,
        bed: form.bed.trim() || null,
        clinicalDiagnosis: form.clinicalDiagnosis.trim() || null,
        orderedAt: null,
        studies: [{
          serviceItemId: Number(form.serviceItemId),
          deviceId: form.deviceId ? Number(form.deviceId) : null,
          // `datetime-local` trả "YYYY-MM-DDTHH:mm"; backend dùng LocalDateTime nên thêm giây.
          scheduledAt: `${form.scheduledAt}:00`,
        }],
      })

      onCreated()
      onClose()
    } catch (err) {
      if (err instanceof ApiError) {
        setError(messageFor(err))
        setFieldErrors(Object.fromEntries(
          err.details.filter(d => d.field).map(d => [d.field!, d.issue ?? 'không hợp lệ']),
        ))
      } else {
        setError('Không gọi được máy chủ, thử lại.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="THÊM CA CHỤP"
      width={620}
      footer={
        <>
          {missing.length > 0 && (
            <span className="mr-auto text-[11px] text-ink-4">Còn thiếu: {missing.join(', ')}</span>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button
            icon={<Plus size={12} />}
            disabled={busy || !allowed || missing.length > 0}
            title={allowed ? undefined : deniedReason('patient.create')}
            onClick={() => void submit()}
          >
            {busy ? 'Đang tạo…' : 'Tạo mới'}
          </Button>
        </>
      }
    >
      {!allowed && (
        <div className="mb-3 flex items-start gap-1.5 rounded-md border border-[#f6e0b5] bg-[#fdf9ef] px-2.5 py-2 text-[11.5px] text-[#92400e]">
          <Warning size={13} className="mt-px shrink-0" />
          Bạn chỉ xem được form này. {deniedReason('patient.create')}.
        </div>
      )}

      <Checkbox
        checked={newPatient}
        onChange={v => { setNewPatient(v); setError(null) }}
        label={<span className="font-medium text-ink-2">Thêm mới bệnh nhân</span>}
        className="mb-3"
      />

      {newPatient ? (
        <>
          <Row>
            <Field label="Mã bệnh nhân *" error={fieldErrors.patient_code}>
              <Input
                placeholder="Ví dụ: TEST0009"
                value={form.patientCode}
                onChange={e => set('patientCode', e.target.value)}
              />
            </Field>
            <Field label="Họ tên *" span={2} error={fieldErrors.full_name}>
              <Input placeholder="Nhập họ tên" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            </Field>
          </Row>

          <Row>
            <Field label="Ngày sinh">
              <Input type="date" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </Field>
            <Field label="Độ chính xác ngày sinh">
              <Select
                value={form.dobPrecision}
                onChange={e => set('dobPrecision', e.target.value as DobPrecision)}
                options={[
                  { value: 'DAY', label: 'Đủ ngày' },
                  { value: 'MONTH', label: 'Chỉ tháng' },
                  { value: 'YEAR', label: 'Chỉ năm' },
                ]}
              />
            </Field>
            <Field label="Giới tính">
              <Select
                value={form.gender}
                onChange={e => set('gender', e.target.value as Gender)}
                options={[
                  { value: 'M', label: 'Nam' },
                  { value: 'F', label: 'Nữ' },
                  { value: 'O', label: 'Khác' },
                  { value: 'U', label: 'Không rõ' },
                ]}
              />
            </Field>
          </Row>

          <Row>
            <Field label="Mã BHXH">
              <Input value={form.socialInsuranceNo} onChange={e => set('socialInsuranceNo', e.target.value)} />
            </Field>
            <Field label="Điện thoại">
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} />
            </Field>
            <Field label="Địa chỉ">
              <Input value={form.address} onChange={e => set('address', e.target.value)} />
            </Field>
          </Row>
        </>
      ) : (
        <div className="mb-3">
          <div className="mb-1 text-[11.5px] text-ink-3">Tìm bệnh nhân đã có *</div>
          <div className="flex gap-2">
            <Input
              withSearchIcon
              placeholder="Nhập mã bệnh nhân"
              value={form.searchCode}
              onChange={e => set('searchCode', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void runSearch() }}
            />
            <Button icon={<Search size={12} />} className="shrink-0 px-3" disabled={searching} onClick={() => void runSearch()}>
              {searching ? 'Đang tìm…' : 'Tìm kiếm'}
            </Button>
          </div>

          <div className="mt-2 space-y-1">
            {searchResults?.length === 0 && (
              <p className="text-[11.5px] text-ink-4">Không tìm thấy bệnh nhân nào khớp mã đã nhập.</p>
            )}
            {searchResults?.map(p => (
              <label
                key={p.id}
                onClick={() => setPicked(p)}
                className={cx(
                  'flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 transition-colors',
                  picked?.id === p.id ? 'border-brand-200 bg-brand-50' : 'border-line bg-white hover:bg-line-soft',
                )}
              >
                <span className="pt-0.5">
                  <Radio checked={picked?.id === p.id} onChange={() => setPicked(p)} label="" />
                </span>
                <span className="leading-snug">
                  <span className="block text-[12px] font-medium text-ink">{p.fullName}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-4">
                    {p.patientCode} · {formatDob(p.dateOfBirth, p.dobPrecision)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2 mt-3 section-label">Chỉ định</div>

      <Row>
        <Field label="Khoa chỉ định *">
          <Select
            placeholder={reference.loading ? 'Đang tải…' : 'Chọn khoa'}
            value={form.departmentId}
            onChange={e => set('departmentId', e.target.value)}
            options={departments.map(d => ({ value: String(d.id), label: d.name }))}
          />
        </Field>
        <Field label="Bác sĩ chỉ định *" span={2}>
          <Input
            placeholder="Nhập tên bác sĩ"
            value={form.orderingDoctorName}
            onChange={e => set('orderingDoctorName', e.target.value)}
          />
        </Field>
      </Row>

      <Row>
        <Field label="Loại bệnh nhân">
          <Select
            value={form.patientClass}
            onChange={e => set('patientClass', e.target.value as PatientClass)}
            options={[
              { value: 'OUTPATIENT', label: 'Ngoại trú' },
              { value: 'INPATIENT', label: 'Nội trú' },
            ]}
          />
        </Field>
        <Field label="Buồng"><Input value={form.room} onChange={e => set('room', e.target.value)} /></Field>
        <Field label="Giường"><Input value={form.bed} onChange={e => set('bed', e.target.value)} /></Field>
      </Row>

      <Row>
        <Field label="Mã LSVV"><Input value={form.visitCode} onChange={e => set('visitCode', e.target.value)} /></Field>
        <Field label="Chẩn đoán ban đầu" span={2}>
          <Input value={form.clinicalDiagnosis} onChange={e => set('clinicalDiagnosis', e.target.value)} />
        </Field>
      </Row>

      <div className="mb-2 mt-3 section-label">Ca chụp</div>

      <Row>
        <Field label="Dịch vụ chụp *" span={2}>
          <Select
            placeholder={reference.loading ? 'Đang tải danh mục…' : 'Chọn dịch vụ'}
            value={form.serviceItemId}
            onChange={e => set('serviceItemId', e.target.value)}
            options={serviceItems.map(s => ({ value: String(s.id), label: `${s.name} (${s.modality})` }))}
          />
        </Field>
        <Field label="Thời gian chụp dự kiến *">
          <Input type="datetime-local" value={form.scheduledAt} onChange={e => set('scheduledAt', e.target.value)} />
        </Field>
      </Row>

      <Row>
        <Field label="Máy chụp" span={3}>
          <Select
            placeholder={reference.loading ? 'Đang tải danh mục…' : 'Chưa gán máy'}
            value={form.deviceId}
            onChange={e => set('deviceId', e.target.value)}
            options={devices.map(d => ({ value: String(d.id), label: `${d.name} (${d.modality})` }))}
          />
        </Field>
      </Row>

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
  dobPrecision: DobPrecision
  gender: Gender
  socialInsuranceNo: string
  phone: string
  address: string
  searchCode: string
  departmentId: string
  orderingDoctorName: string
  patientClass: PatientClass
  room: string
  bed: string
  visitCode: string
  clinicalDiagnosis: string
  serviceItemId: string
  deviceId: string
  scheduledAt: string
}

function emptyForm(): FormState {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    patientCode: '',
    fullName: '',
    dateOfBirth: '',
    dobPrecision: 'DAY',
    gender: 'U',
    socialInsuranceNo: '',
    phone: '',
    address: '',
    searchCode: '',
    departmentId: '',
    orderingDoctorName: '',
    patientClass: 'OUTPATIENT',
    room: '',
    bed: '',
    visitCode: '',
    clinicalDiagnosis: '',
    serviceItemId: '',
    deviceId: '',
    scheduledAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

/** Dịch mã lỗi của backend sang câu người dùng đọc được (`doc/api/openapi.yaml` bảng mã lỗi). */
export function messageFor(err: ApiError): string {
  switch (err.code) {
    case 'PATIENT_DUPLICATE_CODE':
      return 'Mã bệnh nhân đã tồn tại. Chọn mã khác, hoặc bỏ tick "Thêm mới bệnh nhân" rồi tìm bệnh nhân có sẵn.'
    case 'PATIENT_SUSPECTED_DUPLICATE':
      return 'Mã BHXH này đã gắn với một bệnh nhân khác — cần đối chiếu trước khi tạo mới.'
    case 'VALIDATION_ERROR':
      return `Dữ liệu chưa hợp lệ. ${err.details.map(d => `${d.field}: ${d.issue}`).join('; ')}`
    default:
      return err.isForbidden ? `Bạn không đủ quyền thực hiện thao tác này. ${err.message}` : err.message
  }
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 grid grid-cols-3 gap-2.5">{children}</div>
}

function Field({ label, span = 1, error, children }: {
  label: string
  span?: 1 | 2 | 3
  error?: string
  children: React.ReactNode
}) {
  const cls = span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : 'col-span-1'
  return (
    <label className={cls}>
      <div className="mb-1 text-[11.5px] text-ink-3">{label}</div>
      {children}
      {error && <div className="mt-0.5 text-[10.5px] text-[#c81e1e]">{error}</div>}
    </label>
  )
}
