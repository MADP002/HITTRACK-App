import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove, getDoc,
} from 'firebase/firestore';
import { C } from '../lib/theme';

// ── Reddit-style community board. Reads/writes the SAME `forum` collection the
//    web app uses (web src/pages/Forum.jsx), so posts/replies/likes sync both ways.
const CATEGORIES = ['General', 'Training', 'Nutrition', 'Equipment', 'Events', 'Other'];
const CAT_COLORS = { General: C.gold, Training: C.red, Nutrition: C.green, Equipment: C.blue, Events: C.purple, Other: C.gray };
const CAT_ICONS  = { General: '💬', Training: '🏋️', Nutrition: '🥗', Equipment: '🥊', Events: '📅', Other: '💡' };
const ROLE_BADGE = {
  admin: { color: C.purple, label: 'ADMIN', icon: '👑' },
  coach: { color: C.blue,   label: 'COACH', icon: '🥊' },
};

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date((ts.seconds || 0) * 1000);
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 60)     return 'just now';
  if (sec < 3600)   return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400)  return Math.floor(sec / 3600) + 'h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function initials(name) { return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function avatarColor(name) {
  const colors = [C.red, C.gold, C.blue, C.green, C.purple, C.orange];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function ForumBoard() {
  const me = auth.currentUser;
  const [profile, setProfile]       = useState({ name: 'Member', role: 'member' });
  const [posts, setPosts]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [activePost, setActivePost] = useState(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle]     = useState('');
  const [newBody, setNewBody]       = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [replyText, setReplyText]   = useState('');
  const [filterCat, setFilterCat]   = useState('All');
  const [searchQ, setSearchQ]       = useState('');
  const [posting, setPosting]       = useState(false);
  const [replying, setReplying]     = useState(false);

  const role = profile.role || 'member';

  useEffect(() => {
    if (!me) return;
    getDoc(doc(db, 'users', me.uid)).then(snap => { if (snap.exists()) setProfile(snap.data()); }).catch(() => {});
  }, [me?.uid]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'forum'), snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPosts(items);
      setLoading(false);
    }, e => { console.error('Forum listener:', e); setLoading(false); });
    return () => unsub();
  }, []);

  // Keep the open thread in sync with live updates (new replies/likes, or deletion).
  useEffect(() => {
    if (!activePost) return;
    const fresh = posts.find(p => p.id === activePost.id);
    setActivePost(fresh || null);
  }, [posts]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = posts.filter(p => {
    if (filterCat !== 'All' && p.category !== filterCat) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return (p.title || '').toLowerCase().includes(q)
        || (p.body || '').toLowerCase().includes(q)
        || (p.authorName || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function createPost() {
    if (!newTitle.trim() || !newBody.trim() || !me) return;
    setPosting(true);
    try {
      await addDoc(collection(db, 'forum'), {
        title: newTitle.trim(), body: newBody.trim(), category: newCategory,
        authorUid: me.uid, authorName: profile.name || 'Member', authorRole: role,
        replies: [], likes: [], createdAt: serverTimestamp(),
      });
      setNewTitle(''); setNewBody(''); setNewCategory('General'); setShowNewPost(false);
    } catch (e) { console.error('createPost:', e); }
    setPosting(false);
  }

  async function postReply() {
    if (!replyText.trim() || !activePost || !me) return;
    setReplying(true);
    try {
      const reply = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: replyText.trim(), authorUid: me.uid,
        authorName: profile.name || (role === 'coach' ? 'Coach' : 'Member'), authorRole: role,
        createdAt: new Date().toISOString(),
      };
      await updateDoc(doc(db, 'forum', activePost.id), { replies: arrayUnion(reply) });
      setReplyText('');
    } catch (e) { console.error('postReply:', e); }
    setReplying(false);
  }

  async function toggleLike(post) {
    if (!me) return;
    const liked = (post.likes || []).includes(me.uid);
    try { await updateDoc(doc(db, 'forum', post.id), { likes: liked ? arrayRemove(me.uid) : arrayUnion(me.uid) }); }
    catch (e) { console.error('toggleLike:', e); }
  }

  async function deletePost(postId) {
    try { await deleteDoc(doc(db, 'forum', postId)); setActivePost(null); }
    catch (e) { console.error('deletePost:', e); }
  }
  async function deleteReply(postId, replyObj) {
    try { await updateDoc(doc(db, 'forum', postId), { replies: arrayRemove(replyObj) }); }
    catch (e) { console.error('deleteReply:', e); }
  }
  const canDelete = (item) => !!me && (item.authorUid === me.uid || role === 'admin' || role === 'coach');

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.red} /></View>;
  }

  // ─────────────────────────── THREAD VIEW ───────────────────────────
  if (activePost) {
    const cc = CAT_COLORS[activePost.category] || C.gray;
    const liked = (activePost.likes || []).includes(me?.uid);
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.threadScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={s.backRow} onPress={() => setActivePost(null)}>
            <Ionicons name="arrow-back" size={16} color={C.gray} />
            <Text style={s.backText}>BACK TO FORUM</Text>
          </TouchableOpacity>

          {/* Original post */}
          <View style={[s.postCard, { borderColor: cc + '44' }]}>
            <View style={[s.cardStripe, { backgroundColor: cc }]} />
            <View style={s.badgeRow}>
              <View style={[s.catBadge, { backgroundColor: cc + '22', borderColor: cc + '44' }]}>
                <Text style={[s.catBadgeText, { color: cc }]}>{CAT_ICONS[activePost.category]} {activePost.category}</Text>
              </View>
              {ROLE_BADGE[activePost.authorRole] && (
                <View style={[s.roleBadge, { backgroundColor: ROLE_BADGE[activePost.authorRole].color + '22', borderColor: ROLE_BADGE[activePost.authorRole].color + '44' }]}>
                  <Text style={[s.roleBadgeText, { color: ROLE_BADGE[activePost.authorRole].color }]}>{ROLE_BADGE[activePost.authorRole].icon} {ROLE_BADGE[activePost.authorRole].label}</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              {canDelete(activePost) && (
                <TouchableOpacity style={s.delBtn} onPress={() => deletePost(activePost.id)}>
                  <Ionicons name="trash-outline" size={14} color={C.red} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={s.postTitle}>{activePost.title}</Text>
            <View style={s.authorRow}>
              <View style={[s.avatar, { backgroundColor: avatarColor(activePost.authorName) + '33' }]}>
                <Text style={[s.avatarText, { color: avatarColor(activePost.authorName) }]}>{initials(activePost.authorName)}</Text>
              </View>
              <Text style={s.authorName}>{activePost.authorName}</Text>
              <Text style={s.dot}>·</Text>
              <Text style={s.timeText}>{timeAgo(activePost.createdAt)}</Text>
            </View>
            <View style={s.bodyBox}><Text style={s.postBody}>{activePost.body}</Text></View>
            <View style={s.actionRow}>
              <TouchableOpacity style={[s.likeBtn, liked && { backgroundColor: C.red + '1a', borderColor: C.red + '4d' }]} onPress={() => toggleLike(activePost)}>
                <Text style={{ fontSize: 13 }}>{liked ? '❤️' : '🤍'}</Text>
                <Text style={[s.likeCount, liked && { color: C.red }]}>{(activePost.likes || []).length}</Text>
              </TouchableOpacity>
              <Text style={s.replyCountText}>💬 {(activePost.replies || []).length} repl{(activePost.replies || []).length === 1 ? 'y' : 'ies'}</Text>
            </View>
          </View>

          {/* Replies */}
          {(activePost.replies || []).length > 0 && (
            <Text style={s.repliesLabel}>REPLIES ({(activePost.replies || []).length})</Text>
          )}
          {(activePost.replies || []).map((r, i) => {
            const isStaff = r.authorRole === 'coach' || r.authorRole === 'admin';
            const accent = isStaff ? (r.authorRole === 'admin' ? C.purple : C.blue) : avatarColor(r.authorName);
            const badge = ROLE_BADGE[r.authorRole];
            return (
              <View key={r.id || i} style={[s.replyCard, isStaff && { borderColor: accent + '40' }]}>
                {isStaff && <View style={[s.cardStripe, { backgroundColor: accent }]} />}
                <View style={s.replyTop}>
                  <View style={[s.replyAvatar, { backgroundColor: accent + '33' }]}>
                    <Text style={[s.replyAvatarText, { color: accent }]}>{initials(r.authorName)}</Text>
                  </View>
                  <Text style={[s.replyAuthor, { color: isStaff ? accent : C.lightGray }]} numberOfLines={1}>{r.authorName}</Text>
                  {badge && (
                    <View style={[s.roleBadgeSm, { backgroundColor: badge.color + '22', borderColor: badge.color + '44' }]}>
                      <Text style={[s.roleBadgeSmText, { color: badge.color }]}>{badge.icon} {badge.label}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <Text style={s.replyTime}>{timeAgo({ seconds: new Date(r.createdAt).getTime() / 1000 })}</Text>
                  {canDelete(r) && (
                    <TouchableOpacity onPress={() => deleteReply(activePost.id, r)} style={{ padding: 3 }}>
                      <Ionicons name="trash-outline" size={12} color={C.red} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={s.replyBody}>{r.text}</Text>
              </View>
            );
          })}
          <View style={{ height: 12 }} />
        </ScrollView>

        {/* Reply input */}
        <View style={s.inputBar}>
          <TextInput
            style={s.replyInput} value={replyText} onChangeText={setReplyText}
            placeholder={role === 'coach' || role === 'admin' ? 'Share your expertise…' : 'Write a reply…'}
            placeholderTextColor={C.gray} multiline maxLength={1000}
          />
          <TouchableOpacity style={[s.sendBtn, (!replyText.trim() || replying) && { opacity: 0.4 }]} onPress={postReply} disabled={!replyText.trim() || replying}>
            {replying ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="send" size={18} color="#000" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ─────────────────────────── LIST VIEW ───────────────────────────
  const totalReplies = posts.reduce((a, p) => a + (p.replies || []).length, 0);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.listScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroTitle}>💬 Community Forum</Text>
            <Text style={s.heroSub}>{posts.length} post{posts.length === 1 ? '' : 's'} · {totalReplies} repl{totalReplies === 1 ? 'y' : 'ies'}</Text>
          </View>
          <TouchableOpacity style={[s.newPostBtn, showNewPost && s.newPostBtnCancel]} onPress={() => setShowNewPost(v => !v)}>
            <Text style={[s.newPostBtnText, showNewPost && { color: C.gray }]}>{showNewPost ? '✕ Cancel' : '+ New Post'}</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.gray} />
          <TextInput style={s.searchInput} value={searchQ} onChangeText={setSearchQ} placeholder="Search posts, topics, authors…" placeholderTextColor={C.gray} autoCapitalize="none" autoCorrect={false} />
          {searchQ.length > 0 && <TouchableOpacity onPress={() => setSearchQ('')}><Ionicons name="close-circle" size={16} color={C.gray} /></TouchableOpacity>}
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {['All', ...CATEGORIES].map(c => {
            const active = filterCat === c;
            const cc = c === 'All' ? C.gold : (CAT_COLORS[c] || C.gray);
            const icon = c === 'All' ? '🔥' : CAT_ICONS[c];
            return (
              <TouchableOpacity key={c} onPress={() => setFilterCat(c)} style={[s.chip, active && { backgroundColor: cc + '22', borderColor: cc + '66' }]}>
                <Text style={[s.chipText, { color: active ? cc : C.gray }]}>{icon} {c}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* New post form */}
        {showNewPost && (
          <View style={s.formCard}>
            <View style={[s.cardStripe, { backgroundColor: C.red }]} />
            <Text style={s.formHeading}>✏️ Create a Post</Text>
            <Text style={s.formLabel}>TITLE</Text>
            <TextInput style={s.formInput} value={newTitle} onChangeText={setNewTitle} placeholder="e.g. Best wraps for beginners?" placeholderTextColor={C.gray} maxLength={120} />
            <Text style={s.formLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {CATEGORIES.map(c => {
                const active = newCategory === c; const cc = CAT_COLORS[c] || C.gray;
                return (
                  <TouchableOpacity key={c} onPress={() => setNewCategory(c)} style={[s.chip, active && { backgroundColor: cc + '22', borderColor: cc + '66' }]}>
                    <Text style={[s.chipText, { color: active ? cc : C.gray }]}>{CAT_ICONS[c]} {c}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Text style={s.formLabel}>BODY</Text>
            <TextInput style={[s.formInput, s.formTextarea]} value={newBody} onChangeText={setNewBody} placeholder="Describe your question or topic…" placeholderTextColor={C.gray} multiline maxLength={2000} />
            <TouchableOpacity style={[s.publishBtn, (!newTitle.trim() || !newBody.trim() || posting) && { opacity: 0.5 }]} onPress={createPost} disabled={!newTitle.trim() || !newBody.trim() || posting}>
              <Text style={s.publishBtnText}>{posting ? 'PUBLISHING…' : 'PUBLISH POST'}</Text>
            </TouchableOpacity>
            <Text style={s.formHint}>Visible to all members and coaches · syncs with the web app</Text>
          </View>
        )}

        {/* Post list */}
        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48, opacity: 0.6 }}>💬</Text>
            <Text style={s.emptyTitle}>{searchQ || filterCat !== 'All' ? 'No matching posts' : 'No posts yet'}</Text>
            <Text style={s.emptySub}>{searchQ || filterCat !== 'All' ? 'Try a different search or category' : 'Be the first to start a discussion!'}</Text>
          </View>
        ) : filtered.map(p => {
          const cc = CAT_COLORS[p.category] || C.gray;
          const liked = (p.likes || []).includes(me?.uid);
          const replyCount = (p.replies || []).length;
          const answered = (p.replies || []).some(r => r.authorRole === 'coach' || r.authorRole === 'admin');
          const badge = ROLE_BADGE[p.authorRole];
          return (
            <TouchableOpacity key={p.id} style={s.listCard} onPress={() => { setActivePost(p); setShowNewPost(false); }} activeOpacity={0.85}>
              <View style={[s.cardStripe, { backgroundColor: cc, opacity: 0.7 }]} />
              <View style={[s.avatar, { backgroundColor: avatarColor(p.authorName) + '33' }]}>
                <Text style={[s.avatarText, { color: avatarColor(p.authorName) }]}>{initials(p.authorName)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.badgeRow}>
                  <View style={[s.catBadgeSm, { backgroundColor: cc + '22', borderColor: cc + '44' }]}>
                    <Text style={[s.catBadgeSmText, { color: cc }]}>{CAT_ICONS[p.category]} {p.category}</Text>
                  </View>
                  {badge && <View style={[s.roleBadgeSm, { backgroundColor: badge.color + '22', borderColor: badge.color + '44' }]}><Text style={[s.roleBadgeSmText, { color: badge.color }]}>{badge.icon} {badge.label}</Text></View>}
                  {answered && <View style={s.answeredBadge}><Text style={s.answeredText}>✓ ANSWERED</Text></View>}
                </View>
                <Text style={s.listTitle} numberOfLines={1}>{p.title}</Text>
                <Text style={s.listBody} numberOfLines={2}>{p.body}</Text>
                <View style={s.listMeta}>
                  <Text style={s.listAuthor} numberOfLines={1}>{p.authorName}</Text>
                  <Text style={s.dot}>·</Text>
                  <Text style={s.timeText}>{timeAgo(p.createdAt)}</Text>
                </View>
              </View>
              <View style={s.listStats}>
                <View style={[s.statPill, liked && { backgroundColor: C.red + '1a', borderColor: C.red + '4d' }]}>
                  <Text style={{ fontSize: 12 }}>{liked ? '❤️' : '🤍'}</Text>
                  <Text style={[s.statPillText, liked && { color: C.red }]}>{(p.likes || []).length}</Text>
                </View>
                <View style={s.statPill}>
                  <Text style={{ fontSize: 12 }}>💬</Text>
                  <Text style={[s.statPillText, replyCount > 0 && { color: C.blue }]}>{replyCount}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },

  // List
  listScroll: { padding: 14, paddingBottom: 40, gap: 10 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTitle: { fontSize: 20, fontWeight: '900', color: C.white },
  heroSub: { fontSize: 11, color: C.gray, marginTop: 2 },
  newPostBtn: { backgroundColor: C.red, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  newPostBtnCancel: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  newPostBtnText: { fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, color: C.white, fontSize: 14 },

  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { borderWidth: 1, borderColor: C.border, backgroundColor: C.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 11, fontWeight: '700' },

  // New post form
  formCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.red + '40', padding: 16, paddingLeft: 18, gap: 8, overflow: 'hidden' },
  formHeading: { fontSize: 15, fontWeight: '900', color: C.white, marginBottom: 2 },
  formLabel: { fontSize: 9, fontWeight: '800', color: C.gray, letterSpacing: 1, marginTop: 4 },
  formInput: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 14 },
  formTextarea: { minHeight: 90, textAlignVertical: 'top' },
  publishBtn: { backgroundColor: C.red, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  publishBtnText: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  formHint: { fontSize: 9, color: C.gray, textAlign: 'center', marginTop: 2 },

  // List cards
  listCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, paddingLeft: 16, overflow: 'hidden' },
  cardStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  avatar: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '900' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  catBadgeSm: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  catBadgeSmText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  roleBadgeSm: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeSmText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  answeredBadge: { backgroundColor: C.green + '1f', borderWidth: 1, borderColor: C.green + '40', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  answeredText: { fontSize: 8, fontWeight: '800', color: C.green, letterSpacing: 0.3 },
  listTitle: { fontSize: 14, fontWeight: '800', color: C.white, marginBottom: 3 },
  listBody: { fontSize: 11, color: C.gray, lineHeight: 16 },
  listMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  listAuthor: { fontSize: 10, fontWeight: '700', color: C.lightGray, maxWidth: 120 },
  dot: { fontSize: 10, color: C.gray },
  timeText: { fontSize: 10, color: C.gray },
  listStats: { alignItems: 'center', gap: 6 },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  statPillText: { fontSize: 10, fontWeight: '800', color: C.gray },

  // Empty
  empty: { alignItems: 'center', gap: 10, paddingTop: 70 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.white },
  emptySub: { fontSize: 12, color: C.gray, textAlign: 'center', paddingHorizontal: 30 },

  // Thread
  threadScroll: { padding: 14, paddingBottom: 16, gap: 10 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9 },
  backText: { fontSize: 10, fontWeight: '800', color: C.gray, letterSpacing: 0.5 },
  postCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, padding: 18, paddingLeft: 20, gap: 10, overflow: 'hidden' },
  catBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  catBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  roleBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  delBtn: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.red + '14', borderWidth: 1, borderColor: C.red + '33', justifyContent: 'center', alignItems: 'center' },
  postTitle: { fontSize: 20, fontWeight: '900', color: C.white, lineHeight: 26 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authorName: { fontSize: 12, fontWeight: '700', color: C.lightGray },
  bodyBox: { backgroundColor: C.inputBg, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14 },
  postBody: { fontSize: 13, color: C.lightGray, lineHeight: 21 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  likeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  likeCount: { fontSize: 12, fontWeight: '800', color: C.gray },
  replyCountText: { fontSize: 11, fontWeight: '600', color: C.gray },

  repliesLabel: { fontSize: 10, fontWeight: '800', color: C.blue, letterSpacing: 1.2, marginTop: 4, marginLeft: 2 },
  replyCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, paddingLeft: 16, gap: 8, overflow: 'hidden' },
  replyTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  replyAvatar: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  replyAvatarText: { fontSize: 10, fontWeight: '900' },
  replyAuthor: { fontSize: 12, fontWeight: '700', maxWidth: 110 },
  replyTime: { fontSize: 9, color: C.gray },
  replyBody: { fontSize: 12, color: C.lightGray, lineHeight: 19, paddingLeft: 34 },

  // Input bar
  inputBar: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  replyInput: { flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 10, color: C.white, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center' },
});
