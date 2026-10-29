const RFC4122_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Return the canonical UUID used by collaboration routes from current and legacy project IDs. */
export function getCanonicalProjectUuid(projectId: string): string {
  const legacyPrefixed = /^CF-([0-9a-f-]{36})$/i.exec(projectId)?.[1]
  const candidate = (legacyPrefixed ?? projectId).toLowerCase()
  if (!RFC4122_UUID.test(candidate)) throw new Error('โครงการนี้ไม่มี Project UUID ที่ใช้กับ gateway · สร้างโครงการใหม่หรือเปิดไฟล์โครงการที่มี UUID')
  return candidate
}
