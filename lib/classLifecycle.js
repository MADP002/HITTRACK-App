import {
  doc, getDocs, collection, query, where,
  runTransaction, serverTimestamp, addDoc, writeBatch,
} from 'firebase/firestore'
import { db, auth } from '../firebase'
import { logActivity } from './activityLog'

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const CLASS_DURATION_HOURS = 2

// Replaces sessionStorage (not available in React Native)
let lastAutoEndScan = 0

function parseTimeString(timeStr) {
  if (!timeStr) return null
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!m) return null
  let h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  const period = m[3].toUpperCase()
  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0
  return { h, m: min }
}

export function getClassStartTime(cls) {
  if (!cls || !cls.day || !cls.time) return null
  const dayIdx = DAYS.indexOf(cls.day)
  if (dayIdx === -1) return null
  const t = parseTimeString(cls.time)
  if (!t) return null
  let createdAt
  if (cls.createdAt?.toDate)        createdAt = cls.createdAt.toDate()
  else if (cls.createdAt?.seconds)  createdAt = new Date(cls.createdAt.seconds * 1000)
  else                              createdAt = new Date()
  const result = new Date(createdAt)
  result.setHours(t.h, t.m, 0, 0)
  let safety = 0
  while ((result.getDay() !== dayIdx || result < createdAt) && safety < 10) {
    result.setDate(result.getDate() + 1)
    result.setHours(t.h, t.m, 0, 0)
    safety++
  }
  return result
}

export function isClassPassed(cls) {
  if (!cls) return false
  if (cls.status === 'ended') return true
  const start = getClassStartTime(cls)
  if (!start) return false
  return Date.now() >= start.getTime() + CLASS_DURATION_HOURS * 3600000
}

export function isClassActive(cls) {
  return cls && cls.status !== 'ended' && !isClassPassed(cls)
}

export async function endClass(cls, { isAuto = false, actorName = 'Coach' } = {}) {
  const me = auth.currentUser
  if (!me || !cls?.id) return { ended: false, notified: 0 }
  const classRef = doc(db, 'classes', cls.id)
  let acquired = false
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(classRef)
      if (!snap.exists()) return
      if (snap.data().status === 'ended') return
      tx.update(classRef, {
        status: 'ended', endedAt: serverTimestamp(),
        endedBy: isAuto ? 'auto' : 'manual',
        endedByUid: me.uid, endedByName: isAuto ? 'System' : (actorName || 'Coach'),
      })
      acquired = true
    })
  } catch (e) { console.error('endClass transaction failed:', e); return { ended: false, notified: 0 } }
  if (!acquired) return { ended: false, notified: 0 }

  let participants = []
  try {
    const q = query(collection(db, 'bookings'), where('classId', '==', cls.id))
    const snap = await getDocs(q)
    participants = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch (e) { console.warn('endClass: could not load bookings:', e.message) }

  let notified = 0
  if (participants.length > 0) {
    try {
      const batch = writeBatch(db)
      const notifCol = collection(db, 'notifications')
      const coachName = cls.coach || 'Your Coach'
      participants.forEach(p => {
        const memberUid = p.memberId || p.userId || p.uid
        if (!memberUid) return
        const newRef = doc(notifCol)
        batch.set(newRef, {
          title: `🙏 Thank You for Joining ${cls.name || 'the Class'}!`,
          message: `Coach ${coachName} thanks you for showing up to ${cls.name||'the class'} (${cls.day||''} · ${cls.time||''}). Great work — keep stepping into the ring. 🥊`,
          audience: 'member', targetUserId: memberUid,
          type: 'class_thanks', classId: cls.id, className: cls.name,
          from: coachName, fromUid: me.uid, createdAt: serverTimestamp(),
        })
        notified++
      })
      if (notified > 0) await batch.commit()
    } catch (e) { console.warn('endClass: thank-you batch failed:', e.message) }
  }

  logActivity({
    type: 'class_ended', actorId: me.uid,
    actorName: isAuto ? 'System' : (actorName || 'Coach'),
    actorRole: isAuto ? 'system' : 'coach',
    payload: { classId: cls.id, className: cls.name, classDay: cls.day||'', classTime: cls.time||'', isAuto, notifiedCount: notified },
  })
  return { ended: true, notified }
}

export async function autoEndPastClasses(classes) {
  const now = Date.now()
  if (now - lastAutoEndScan < 5 * 60 * 1000) return { scanned: 0, ended: 0 }
  lastAutoEndScan = now
  const candidates = (classes || []).filter(c => c.status !== 'ended' && isClassPassed(c))
  let ended = 0
  for (const cls of candidates) {
    try { const r = await endClass(cls, { isAuto: true }); if (r.ended) ended++ }
    catch (e) { console.warn('Auto-end of class', cls.id, 'failed:', e.message) }
  }
  return { scanned: candidates.length, ended }
}