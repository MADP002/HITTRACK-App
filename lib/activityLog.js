import { db } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

export const ACTIVITY_TYPES = {
  booking_created:    { icon:'📋', color:'#42a5f5', label:'Booking',        verb:'booked' },
  booking_cancelled:  { icon:'✕',  color:'#e84a2f', label:'Cancellation',   verb:'cancelled' },
  class_created:      { icon:'🥊', color:'#f5c842', label:'New Class',       verb:'created class' },
  class_deleted:      { icon:'🗑', color:'#a8a29e', label:'Class Removed',   verb:'deleted class' },
  class_ended:        { icon:'🏁', color:'#22c55e', label:'Class Ended',     verb:'ended class' },
  level_change:       { icon:'🎚', color:'#c084fc', label:'Level Update',    verb:'changed level for' },
  member_signup:      { icon:'👋', color:'#22c55e', label:'New Member',      verb:'joined the gym' },
  member_deactivated: { icon:'⏸', color:'#fb923c', label:'Deactivated',     verb:'deactivated' },
  member_reactivated: { icon:'▶', color:'#22c55e', label:'Reactivated',     verb:'reactivated' },
  member_deleted:     { icon:'🗑', color:'#e84a2f', label:'Member Deleted',  verb:'permanently deleted' },
}

function autoDescription(event) {
  const p    = event.payload || {}
  const actor = event.actorName || 'Someone'
  switch (event.type) {
    case 'booking_created':    return `${actor} booked ${p.className||'a class'}${p.classDay?` (${p.classDay} · ${p.classTime||''})`:''}`
    case 'booking_cancelled':  return `${actor} cancelled ${p.className||'a class'}${p.classDay?` (${p.classDay} · ${p.classTime||''})`:''} — slot freed`
    case 'class_created':      return `${actor} created class: ${p.className||'New Class'}${p.classDay?` (${p.classDay} · ${p.classTime||''})`:''}`
    case 'class_deleted':      return `${actor} deleted class: ${p.className||'a class'}`
    case 'class_ended':        return p.isAuto ? `Auto-ended class: ${p.className||'a class'}` : `${actor} marked class ended: ${p.className||'a class'}${p.notifiedCount?` — ${p.notifiedCount} member${p.notifiedCount===1?'':'s'} thanked`:''}`
    case 'level_change':       return `${actor} ${p.isPromote?'promoted':'moved'} ${p.memberName||'a member'} to ${p.newLevel}${p.oldLevel?` (from ${p.oldLevel})`:''}`
    case 'member_signup':      return `${actor} joined the gym${p.experience?` as ${p.experience}`:''}`
    case 'member_deactivated': return `${actor} deactivated ${p.memberName||'a member'}`
    case 'member_reactivated': return `${actor} reactivated ${p.memberName||'a member'}`
    case 'member_deleted':     return `${actor} permanently deleted ${p.memberName||'a member'}`
    default:                   return `${actor} performed ${event.type}`
  }
}

export async function logActivity(event) {
  try {
    const t = ACTIVITY_TYPES[event.type]
    if (!t) { console.warn('[ACTIVITY] Unknown event type:', event.type); return }
    const description = event.description || autoDescription(event)
    await addDoc(collection(db, 'activity'), {
      type:        event.type,
      actorId:     event.actorId   || '',
      actorName:   event.actorName || 'Someone',
      actorRole:   event.actorRole || 'system',
      description,
      ...(event.payload || {}),
      createdAt: serverTimestamp(),
    })
  } catch (err) {
    console.error(`[ACTIVITY] Failed to log ${event.type}:`, err.message)
  }
}