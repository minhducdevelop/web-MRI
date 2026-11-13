import { describe, expect, it } from 'vitest'
import { ROLE_META, can, type Permission } from './auth'
import { TRANSITIONS } from './stateMachine'
import type { AppUser, RoleCode } from './types'

/**
 * Khóa ma trận quyền của Frontend vào đúng `doc/06b-ui-permission-spec.md` mục 1
 * (bản gộp của `doc/06-rbac-matrix.md` mục 3 và 4).
 *
 * Bảng dưới đây **chép tay từ tài liệu**, không import từ `auth.ts` — nếu ai sửa `auth.ts` mà
 * không sửa tài liệu (hoặc ngược lại) thì test đỏ. Đó là mục đích: trước đây hai bên lệch nhau
 * mà không ai biết (T30).
 */
const ROLES: RoleCode[] = ['ADMIN', 'CLINICIAN', 'TECHNICIAN', 'RADIOLOGIST', 'APPROVER']

/** Thứ tự cột: ADMIN · CLINICIAN · TECHNICIAN · RADIOLOGIST · APPROVER. */
const MATRIX: Record<Permission, [boolean, boolean, boolean, boolean, boolean]> = {
  'patient.create': [true, true, true, false, false],
  'patient.update': [true, true, true, false, false],
  'order.sync': [true, true, true, false, false],
  'clinical.view': [true, true, true, true, true],
  'report.write': [false, false, false, true, false],
  'report.approve': [false, false, false, false, true],
  'study.markReceived': [true, false, true, false, false],
  'study.reopen': [true, false, false, false, true],
  'study.cancel': [true, false, true, false, false],
  'study.release': [true, false, false, false, false],
  'conflict.resolve': [true, false, true, false, false],
  'audit.view': [true, false, false, false, false],
  'list.print': [true, true, true, true, true],
  'report.print': [true, true, true, true, true],
  'study.viewImage': [true, true, true, true, true],
  'config.system': [true, false, false, false, false],
}

const userWith = (role: RoleCode): AppUser => ({
  id: 1,
  username: role.toLowerCase(),
  fullName: `Tài khoản ${role}`,
  email: '',
  departmentId: null,
  roles: [role],
})

describe('ma trận quyền khớp doc/06b mục 1', () => {
  for (const [permission, expected] of Object.entries(MATRIX) as [Permission, boolean[]][]) {
    it(`${permission}`, () => {
      const actual = ROLES.map(role => can(userWith(role), permission))
      expect(actual).toEqual(expected)
    })
  }

  it('không có permission nào thiếu trong bảng đối chiếu', () => {
    // Nếu ai thêm permission mới vào auth.ts thì phải thêm cả vào bảng trên và vào tài liệu.
    const declared = Object.keys(MATRIX).length
    expect(declared).toBe(16)
  })
})

describe('bước chuyển trạng thái gắn đúng quyền (doc/06 mục 4)', () => {
  // Nguồn: doc/06-rbac-matrix.md mục 4, cột "được phép" rút về permission tương ứng.
  const EXPECTED: Record<string, { to: string; permission: Permission; roles: RoleCode[] }> = {
    T2: { to: 'UNREAD', permission: 'study.markReceived', roles: ['ADMIN', 'TECHNICIAN'] },
    T3: { to: 'READING', permission: 'report.write', roles: ['RADIOLOGIST'] },
    T4: { to: 'UNREAD', permission: 'report.write', roles: ['RADIOLOGIST'] },
    T5: { to: 'READ', permission: 'report.write', roles: ['RADIOLOGIST'] },
    T6: { to: 'APPROVING', permission: 'report.approve', roles: ['APPROVER'] },
    T7: { to: 'APPROVED', permission: 'report.approve', roles: ['APPROVER'] },
    T8: { to: 'READING', permission: 'report.approve', roles: ['APPROVER'] },
    T9: { to: 'READING', permission: 'study.reopen', roles: ['ADMIN', 'APPROVER'] },
    T10: { to: 'CANCELLED', permission: 'study.cancel', roles: ['ADMIN', 'TECHNICIAN'] },
  }

  it('TRANSITIONS phủ đúng T2…T10', () => {
    expect(TRANSITIONS.map(t => t.code).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const [code, expected] of Object.entries(EXPECTED)) {
    it(`${code} → ${expected.to}`, () => {
      const transition = TRANSITIONS.find(t => t.code === code)
      expect(transition).toBeDefined()
      expect(transition!.to).toBe(expected.to)
      expect(transition!.permission).toBe(expected.permission)

      const allowedRoles = ROLES.filter(role => can(userWith(role), transition!.permission))
      expect(allowedRoles).toEqual(expected.roles)
    })
  }

  it('nhánh ngoại lệ bắt buộc nhập lý do đúng T4, T8, T9, T10', () => {
    const exceptional = TRANSITIONS.filter(t => t.exceptional).map(t => t.code).sort()
    expect(exceptional).toEqual(['T10', 'T4', 'T8', 'T9'])
  })
})

describe('nhãn vai trò', () => {
  it('đủ 5 vai trò, không vai trò nào thiếu nhãn', () => {
    expect(Object.keys(ROLE_META).sort()).toEqual([...ROLES].sort())
    for (const role of ROLES) {
      expect(ROLE_META[role].label).not.toBe('')
      expect(ROLE_META[role].short).not.toBe('')
    }
  })
})
