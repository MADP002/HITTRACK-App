import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet,  ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import {
  collection, query, where, orderBy, limit, onSnapshot, addDoc,
  getDocs, serverTimestamp, doc, deleteDoc, getDoc,
} from 'firebase/firestore';

const C = {
  bg: '#0A0A0A', card: '#161616', border: '#2A2A2A',
  red: '#E63946', white: '#FFFFFF', gray: '#888888',
  green: '#4ade80', gold: '#F5C842', blue: '#42a5f5',
  purple: '#c084fc', inputBg: '#1E1E1E', lightGray: '#CCCCCC',
};

const ROLE_COLOR = { admin: '#c084fc', coach: '#42a5f5', member: '#F5C842' };
const ROLE_ICON  = { admin: '👑',      coach: '🥊',       member: '🥋'     };
const ROLE_LABEL = { admin: 'Admin',   coach: 'Coach',    member: 'Member' };

// ── TIME FORMATTERS ─────────────────────────────────────────────────────────
function fmtConvTime(ts) {
  if (!ts?.seconds) return '';
  const d    = new Date(ts.seconds * 1000);
  const diff = Math.floor((Date.now() - d) / 60000);
  if (diff < 1)    return 'now';
  if (diff < 60)   return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  if (diff < 10080)return `${Math.floor(diff / 1440)}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMsgTime(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtMsgDate(ts) {
  if (!ts?.seconds) return '';
  const d     = new Date(ts.seconds * 1000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d >= today) return 'Today';
  if (d >= yest)  return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function InboxScreen() {
  const currentUid = auth.currentUser?.uid;
   const router = useRouter();
  const [profile,       setProfile]       = useState({ name: 'Me', role: 'member' });
  const [messages,      setMessages]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [readMap,       setReadMap]       = useState({});  // uid → last-read ts (seconds)
  const [searchQ,       setSearchQ]       = useState('');
  const [activeUid,     setActiveUid]     = useState(null);
  const [showThread,    setShowThread]    = useState(false);
  const [showCompose,   setShowCompose]   = useState(false);
  const [composeSearch, setComposeSearch] = useState('');
  const [msgText,       setMsgText]       = useState('');
  const [showForum,     setShowForum]     = useState(false);
  const [forumMessages, setForumMessages] = useState([]);
  const [forumText,     setForumText]     = useState('');
  const [sendingForum,  setSendingForum]  = useState(false);
  const forumLastViewedRef = useRef(0);
  const forumScrollRef     = useRef(null);
  const [sending,       setSending]       = useState(false);
  const scrollRef = useRef(null);

  // Load own profile
  useEffect(() => {
    if (!currentUid) return;
    getDoc(doc(db, 'users', currentUid))
      .then(s => { if (s.exists()) setProfile(s.data()); })
      .catch(console.error);
  }, [currentUid]);
 
  // Real-time messages (no orderBy — avoids composite index requirement, sort client-side)
  useEffect(() => {
    if (!currentUid) return;
    const q = query(collection(db, 'messages'), where('participants', 'array-contains', currentUid));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
          const tb = b.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER;
          return ta - tb;
        });
      setMessages(list);
    }, console.error);
    return () => unsub();
  }, [currentUid]);

  // Load all other users (for compose + name/role lookup)
  useEffect(() => {
    if (!currentUid) return;
    getDocs(collection(db, 'users')).then(snap => {
      const list = [];
      snap.docs.forEach(d => {
        if (d.id === currentUid) return;
        const data = d.data();
        if (!data.name) return;
        list.push({
          uid:        d.id,
          name:       data.name,
          role:       data.role || 'member',
          experience: data.experience || 'Beginner',
          goal:       data.goal || '',
        });
      });
      setUsers(list);
    }).catch(console.error);
  }, [currentUid]);
 
  // Forum group chat — real-time listener for groupMessages
  useEffect(() => {
    const q = query(collection(db, 'groupMessages'), orderBy('createdAt', 'asc'), limit(200));
    const unsub = onSnapshot(q, snap => {
      setForumMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.error);
    return () => unsub();
  }, []);
 
  // Scroll Forum to bottom when opened or new message arrives
  useEffect(() => {
    if (showForum) {
      setTimeout(() => forumScrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [showForum, forumMessages.length]);
 
  // Scroll to bottom when thread opens or new message arrives
  useEffect(() => {
    if (showThread) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    }
  }, [showThread, messages.length]);
 
  // Forum helpers
  const handleBack = () => {
    if (profile.role === 'coach') router.replace('/(coach)/home');
    else if (profile.role === 'admin') router.replace('/(admin)/overview');
    else router.replace('/(member)/home');
  };

  const openForum = () => {
    forumLastViewedRef.current = Math.floor(Date.now() / 1000);
    setShowForum(true);
  };
 
  const sendForumMessage = async () => {
    if (!forumText.trim() || sendingForum) return;
    setSendingForum(true);
    try {
      await addDoc(collection(db, 'groupMessages'), {
        from:     currentUid,
        fromName: profile.name  || 'User',
        fromRole: profile.role  || 'member',
        text:     forumText.trim(),
        createdAt: serverTimestamp(),
      });
      setForumText('');
    } catch (e) { console.error('Forum send error:', e); }
    setSendingForum(false);
  };

  // Open a conversation + mark as read
  const openConversation = useCallback((uid) => {
    setActiveUid(uid);
    setReadMap(prev => ({ ...prev, [uid]: Math.floor(Date.now() / 1000) }));
    setMsgText('');
    setShowThread(true);
  }, []);
  
  // Group messages → conversations (same logic as web InboxView)
  const conversations = useMemo(() => {
    const map = {};
    for (const msg of messages) {
      const otherUid = msg.participants?.find(p => p !== currentUid);
      if (!otherUid) continue;
      if (!map[otherUid]) {
        const other = users.find(u => u.uid === otherUid);
        map[otherUid] = {
          uid:      otherUid,
          name:     other?.name || (msg.from === currentUid ? msg.toName : msg.fromName) || 'Unknown',
          role:     other?.role || (msg.from === currentUid ? msg.toRole : msg.fromRole) || 'member',
          messages: [],
          lastMsg:  null,
          lastTs:   0,
          unread:   0,
        };
      }
      map[otherUid].messages.push(msg);
      const ts = msg.createdAt?.seconds || 0;
      if (ts > map[otherUid].lastTs) {
        map[otherUid].lastTs  = ts;
        map[otherUid].lastMsg = msg;
      }
      const lastRead = readMap[otherUid] || 0;
      if (msg.from !== currentUid && ts > lastRead) map[otherUid].unread++;
    }
    return Object.values(map).sort((a, b) => b.lastTs - a.lastTs);
  }, [messages, users, currentUid, readMap]);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
 
  // Forum unread = messages from others since last viewed
  const forumUnread = forumMessages.filter(m =>
    m.from !== currentUid &&
    (m.createdAt?.seconds || 0) > forumLastViewedRef.current
  ).length;
  const lastForumMsg = forumMessages[forumMessages.length - 1];

  // Active conversation — real or placeholder for new conversation
  const activeConv = useMemo(() => {
    if (!activeUid) return null;
    const real = conversations.find(c => c.uid === activeUid);
    if (real) return real;
    const user = users.find(u => u.uid === activeUid);
    if (user) return { uid: user.uid, name: user.name, role: user.role, messages: [], lastMsg: null, lastTs: 0, unread: 0 };
    return null;
  }, [activeUid, conversations, users]);
 
  // Filtered conversation list (search)
  const filteredConvs = conversations.filter(c =>
    !searchQ || c.name.toLowerCase().includes(searchQ.toLowerCase())
  );
 
  // Compose: sorted by role (admin → coach → member), then name
  const composeFiltered = users
    .filter(u => !composeSearch || u.name.toLowerCase().includes(composeSearch.toLowerCase()))
    .sort((a, b) => {
      const order = { admin: 0, coach: 1, member: 2 };
      const o = (order[a.role] ?? 3) - (order[b.role] ?? 3);
      return o !== 0 ? o : a.name.localeCompare(b.name);
    });
 
    // Send message
  const sendMessage = async () => {
    if (!msgText.trim() || !activeUid || sending) return;
    setSending(true);
    const target = users.find(u => u.uid === activeUid) || activeConv;
    try {
      await addDoc(collection(db, 'messages'), {
        participants: [currentUid, activeUid],
        from:         currentUid,
        fromName:     profile.name  || 'User',
        fromRole:     profile.role  || 'member',
        to:           activeUid,
        toName:       target?.name  || 'User',
        toRole:       target?.role  || 'member',
        text:         msgText.trim(),
        createdAt:    serverTimestamp(),
      });
      setMsgText('');
    } catch (e) { console.error('Send error:', e); }
    setSending(false);
  };
 
  // Delete own message
  const deleteMessage = async (msgId) => {
    try { await deleteDoc(doc(db, 'messages', msgId)); }
    catch (e) { console.error('Delete error:', e); }
  };
 
  const myRoleColor = ROLE_COLOR[profile.role] || C.gold;
 
  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      {/* ══════════════════════════════════════════════════════════
           THREAD MODAL
      ══════════════════════════════════════════════════════════ */}
      <Modal visible={showThread} animationType="slide" onRequestClose={() => setShowThread(false)}>
        <SafeAreaView edges={['top']} style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      
            {/* Header */}
            {activeConv && (() => {
              const rc = ROLE_COLOR[activeConv.role] || C.gold;
              return (
                <View style={s.threadHeader}>
                  <TouchableOpacity style={s.iconBtn} onPress={() => setShowThread(false)}>
                    <Ionicons name="arrow-back" size={20} color={C.white} />
                  </TouchableOpacity>
                  <View style={[s.tAvatar, { borderColor: rc + '66', backgroundColor: rc + '22' }]}>
                    <Text style={[s.tAvatarText, { color: rc }]}>{(activeConv.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.tName}>{activeConv.name}</Text>
                    <Text style={[s.tRole, { color: rc }]}>
                      {ROLE_ICON[activeConv.role] || '👤'} {ROLE_LABEL[activeConv.role] || 'User'}
                    </Text>
                  </View>
                </View>
              );
            })()}
     
            {/* Messages */}
            <ScrollView
              ref={scrollRef}
              contentContainerStyle={s.threadScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {(activeConv?.messages || []).length === 0 ? (
                <View style={s.emptyThread}>
                  <Text style={{ fontSize: 48 }}>👋</Text>
                  <Text style={s.emptyThreadTitle}>Say Hello</Text>
                  <Text style={s.emptyThreadSub}>
                    Start a conversation with {activeConv?.name?.split(' ')[0] || 'them'}
                  </Text>
                </View>
              ) : (
                (activeConv?.messages || []).map((m, i, arr) => {
                  const isMe     = m.from === currentUid;
                  const prev     = arr[i - 1];
                  const showDate = !prev || fmtMsgDate(prev.createdAt) !== fmtMsgDate(m.createdAt);
                  const sameAsPrev = prev && prev.from === m.from;
                  const rc = ROLE_COLOR[activeConv?.role] || C.gold;
                  return (
                    <View key={m.id || i}>
                      {showDate && (
                        <View style={s.dateSep}>
                          <Text style={s.dateSepText}>— {fmtMsgDate(m.createdAt)} —</Text>
                        </View>
                      )}
                      <View style={[s.msgRow, { justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: sameAsPrev ? 2 : 10 }]}>
                        {/* Other person's avatar (only on first in group) */}
                        {!isMe && !sameAsPrev && (
                          <View style={[s.msgAvatar, { borderColor: rc + '55', backgroundColor: rc + '22' }]}>
                            <Text style={[{ fontSize: 10, fontWeight: '900', color: rc }]}>
                              {(activeConv?.name || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        {!isMe && sameAsPrev && <View style={{ width: 26 }} />}
                        <View style={{ maxWidth: '74%', gap: 3 }}>
                          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                            <Text style={s.bubbleText}>{m.text}</Text>
                          </View>
                          <View style={[s.msgMeta, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                            <Text style={s.msgMetaTime}>{fmtMsgTime(m.createdAt)}</Text>
                            {isMe && (
                              <TouchableOpacity onPress={() => deleteMessage(m.id)} style={{ padding: 2 }}>
                                <Ionicons name="trash-outline" size={11} color={C.gray} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
   
            {/* Input bar */}
            <View style={s.inputBar}>
              <TextInput
                style={s.textInput}
                value={msgText}
                onChangeText={setMsgText}
                placeholder={`Message ${activeConv?.name?.split(' ')[0] || ''}…`}
                placeholderTextColor={C.gray}
                multiline
                maxLength={1000}
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: myRoleColor }, (!msgText.trim() || sending) && { opacity: 0.35 }]}
                onPress={sendMessage}
                disabled={!msgText.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Ionicons name="send" size={18} color="#000" />
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
   
      {/* ══════════════════════════════════════════════════════
           FORUM GROUP CHAT MODAL
      ══════════════════════════════════════════════════════ */}
      <Modal visible={showForum} animationType="slide" onRequestClose={() => setShowForum(false)}>
        <SafeAreaView edges={['top']} style={s.safe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View style={s.forumHeader}>
              <TouchableOpacity style={s.iconBtn} onPress={() => setShowForum(false)}>
                <Ionicons name="arrow-back" size={20} color={C.white} />
              </TouchableOpacity>
              <View style={s.forumHeaderInfo}>
                <Text style={s.forumHeaderTitle}>🌐 Forum</Text>
                <Text style={s.forumHeaderSub}>All members · coaches · admins</Text>
              </View>
              <View style={[s.forumHeaderBadge]}>
                <Text style={s.forumHeaderBadgeText}>{forumMessages.length}</Text>
              </View>
            </View>
     
            {/* Messages */}
            <ScrollView
              ref={forumScrollRef}
              contentContainerStyle={s.threadScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {forumMessages.length === 0 ? (
                <View style={s.emptyThread}>
                  <Text style={{ fontSize: 48 }}>🌐</Text>
                  <Text style={s.emptyThreadTitle}>Forum is Empty</Text>
                  <Text style={s.emptyThreadSub}>Be the first to say something!</Text>
                </View>
              ) : (
                forumMessages.map((m, i, arr) => {
                  const isMe     = m.from === currentUid;
                  const prev     = arr[i - 1];
                  const sameAsPrev = prev && prev.from === m.from;
                  const rc = ROLE_COLOR[m.fromRole] || C.gold;
                  const showDate = !prev || fmtMsgDate(prev.createdAt) !== fmtMsgDate(m.createdAt);
                  return (
                    <View key={m.id || i}>
                      {showDate && (
                        <View style={s.dateSep}>
                          <Text style={s.dateSepText}>— {fmtMsgDate(m.createdAt)} —</Text>
                        </View>
                      )}
                      {/* Show sender name for others (not consecutive) */}
                      {!isMe && !sameAsPrev && (
                        <View style={s.forumSenderRow}>
                          <View style={[s.forumSenderAvatar, { backgroundColor: rc + '22', borderColor: rc + '55' }]}>
                            <Text style={[{ fontSize: 9, fontWeight: '900', color: rc }]}>
                              {(m.fromName || '?')[0].toUpperCase()}
                            </Text>
                          </View>
                          <Text style={[s.forumSenderName, { color: rc }]}>
                            {m.fromName}
                          </Text>
                          <View style={[s.forumRolePill, { backgroundColor: rc + '18', borderColor: rc + '33' }]}>
                            <Text style={[s.forumRolePillText, { color: rc }]}>
                              {ROLE_LABEL[m.fromRole] || 'User'}
                            </Text>
                          </View>
                        </View>
                      )}
                      <View style={[s.msgRow, { justifyContent: isMe ? 'flex-end' : 'flex-start', marginTop: sameAsPrev ? 2 : 6 }]}>
                        {!isMe && <View style={{ width: 24 }} />}
                        <View style={{ maxWidth: '80%', gap: 3 }}>
                          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
                            <Text style={s.bubbleText}>{m.text}</Text>
                          </View>
                          <View style={[s.msgMeta, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
                            <Text style={s.msgMetaTime}>{fmtMsgTime(m.createdAt)}</Text>
                            {isMe && (
                              <TouchableOpacity onPress={() => deleteDoc(doc(db, 'groupMessages', m.id)).catch(console.error)} style={{ padding: 2 }}>
                                <Ionicons name="trash-outline" size={11} color={C.gray} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
    
            {/* Input */}
            <View style={s.inputBar}>
              <TextInput
                style={s.textInput}
                value={forumText}
                onChangeText={setForumText}
                placeholder="Message everyone…"
                placeholderTextColor={C.gray}
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[s.sendBtn, { backgroundColor: '#6366f1' }, (!forumText.trim() || sendingForum) && { opacity: 0.35 }]}
                onPress={sendForumMessage}
                disabled={!forumText.trim() || sendingForum}
              >
                {sendingForum
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="send" size={18} color="#fff" />
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
 
      {/* ══════════════════════════════════════════════════════════
           COMPOSE MODAL
      ══════════════════════════════════════════════════════════ */}
      <Modal
        visible={showCompose}
        animationType="slide"
        onRequestClose={() => { setShowCompose(false); setComposeSearch(''); }}
      >
        <SafeAreaView edges={['top']} style={s.safe}>
          <View style={s.composeHeader}>
            <TouchableOpacity style={s.iconBtn} onPress={() => { setShowCompose(false); setComposeSearch(''); }}>
              <Ionicons name="arrow-back" size={20} color={C.white} />
            </TouchableOpacity>
            <Text style={s.composeTitle}>New Message</Text>
          </View>
   
          {/* Search */}
          <View style={s.composeSearchBox}>
            <Ionicons name="search-outline" size={16} color={C.gray} />
            <TextInput
              style={s.composeSearchInput}
              value={composeSearch}
              onChangeText={setComposeSearch}
              placeholder="Search by name…"
              placeholderTextColor={C.gray}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {composeSearch.length > 0 && (
              <TouchableOpacity onPress={() => setComposeSearch('')}>
                <Ionicons name="close-circle" size={16} color={C.gray} />
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.composeMeta}>
            {composeFiltered.length} {composeFiltered.length === 1 ? 'person' : 'people'} available
          </Text>
   
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {composeFiltered.length === 0 ? (
              <Text style={[s.composeMeta, { textAlign: 'center', paddingTop: 40 }]}>No results for "{composeSearch}"</Text>
            ) : (
              composeFiltered.map(u => {
                const rc = ROLE_COLOR[u.role] || C.gold;
                return (
                  <TouchableOpacity
                    key={u.uid}
                    style={s.composeRow}
                    onPress={() => {
                      setShowCompose(false);
                      setComposeSearch('');
                      openConversation(u.uid);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[s.composeAvatar, { borderColor: rc + '55', backgroundColor: rc + '22' }]}>
                      <Text style={[s.composeAvatarText, { color: rc }]}>{(u.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.composeUserName}>{u.name}</Text>
                      <Text style={[s.composeUserRole, { color: rc }]}>
                        {ROLE_ICON[u.role]} {ROLE_LABEL[u.role]}
                        {u.role === 'member' && u.experience ? ` · ${u.experience}` : ''}
                        {u.role === 'member' && u.goal ? ` · ${u.goal}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.gray} />
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
   
      {/* ══════════════════════════════════════════════════════════
           CONVERSATION LIST
      ══════════════════════════════════════════════════════════ */}
  
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.inboxBackBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerLeft}>
          <Text style={s.headerTitle}>💬 Inbox</Text>
          {totalUnread > 0 && (
            <View style={[s.totalUnreadBadge, { backgroundColor: C.red }]}>
              <Text style={s.totalUnreadText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={[s.newBtn, { backgroundColor: myRoleColor }]} onPress={() => setShowCompose(true)}>
          <Ionicons name="create-outline" size={16} color="#000" />
          <Text style={s.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>
  
      {/* Search */}
      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.gray} />
          <TextInput
            style={s.searchInput}
            placeholder="Search conversations…"
            placeholderTextColor={C.gray}
            value={searchQ}
            onChangeText={setSearchQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQ.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQ('')}>
              <Ionicons name="close-circle" size={16} color={C.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>
  
      {/* ══════════════════════════════════════════════════════
           FORUM GROUP CHAT CARD (pinned above DMs)
      ══════════════════════════════════════════════════════ */}
      <TouchableOpacity style={s.forumCard} onPress={openForum} activeOpacity={0.85}>
        <View style={s.forumCardAccent} />
        <View style={s.forumCardLeft}>
          <View style={s.forumCardIconWrap}>
            <Text style={{ fontSize: 22 }}>🌐</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.forumCardTitleRow}>
              <Text style={s.forumCardTitle}>Forum</Text>
              <View style={s.forumCardAllBadge}>
                <Text style={s.forumCardAllBadgeText}>Everyone</Text>
              </View>
            </View>
            <Text style={s.forumCardPreview} numberOfLines={1}>
              {lastForumMsg
                ? (lastForumMsg.from === currentUid ? 'You: ' : `${lastForumMsg.fromName?.split(' ')[0]}: `) + lastForumMsg.text
                : 'Tap to join the conversation'
              }
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {forumUnread > 0 && (
            <View style={s.forumUnreadBadge}>
              <Text style={s.forumUnreadBadgeText}>{forumUnread}</Text>
            </View>
          )}
          {lastForumMsg?.createdAt && (
            <Text style={s.convTime}>{fmtConvTime(lastForumMsg.createdAt)}</Text>
          )}
        </View>
      </TouchableOpacity>
  
      {/* Divider between Forum and DMs */}
      <View style={s.forumDivider}>
        <View style={s.dividerLine2} />
        <Text style={s.dividerLabel2}>DIRECT MESSAGES</Text>
        <View style={s.dividerLine2} />
      </View>
   
      {/* List */}
      <ScrollView contentContainerStyle={s.listScroll} showsVerticalScrollIndicator={false}>
        {filteredConvs.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 56 }}>📭</Text>
            <Text style={s.emptyTitle}>{searchQ ? 'No matches' : 'No conversations yet'}</Text>
            <Text style={s.emptySub}>
              {searchQ ? 'Try a different search' : 'Tap New to message a teammate, coach, or admin'}
            </Text>
            {!searchQ && (
              <TouchableOpacity style={[s.newBtn, { backgroundColor: myRoleColor, paddingHorizontal: 22, paddingVertical: 12 }]} onPress={() => setShowCompose(true)}>
                <Ionicons name="create-outline" size={16} color="#000" />
                <Text style={s.newBtnText}>Start a Conversation</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filteredConvs.map(c => {
            const rc        = ROLE_COLOR[c.role] || C.gold;
            const fromMe    = c.lastMsg?.from === currentUid;
            const hasUnread = c.unread > 0;
            return (
              <TouchableOpacity
                key={c.uid}
                style={[s.convRow, hasUnread && { backgroundColor: C.card }]}
                onPress={() => openConversation(c.uid)}
                activeOpacity={0.8}
              >
                {/* Unread accent stripe */}
                {hasUnread && <View style={[s.convAccent, { backgroundColor: rc }]} />}
      
                {/* Avatar */}
                <View style={{ position: 'relative', flexShrink: 0 }}>
                  <View style={[s.convAvatar, { borderColor: rc + '55', backgroundColor: rc + '22' }]}>
                    <Text style={[s.convAvatarText, { color: rc }]}>{(c.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  {c.unread > 0 && (
                    <View style={[s.unreadBadge, { borderColor: hasUnread ? C.card : C.bg }]}>
                      <Text style={s.unreadBadgeText}>{c.unread}</Text>
                    </View>
                  )}
                </View>
       
                {/* Content */}
                <View style={s.convContent}>
                  <View style={s.convTopRow}>
                    <Text style={[s.convName, hasUnread && { color: C.white, fontWeight: '800' }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={s.convTime}>{fmtConvTime(c.lastMsg?.createdAt)}</Text>
                  </View>
                  {c.role !== 'member' && (
                    <View style={[s.rolePill, { backgroundColor: rc + '18', borderColor: rc + '33' }]}>
                      <Text style={[s.rolePillText, { color: rc }]}>{ROLE_ICON[c.role]} {ROLE_LABEL[c.role]}</Text>
                    </View>
                  )}
                  <Text style={[s.convPreview, hasUnread && { color: C.lightGray, fontWeight: '600' }]} numberOfLines={1}>
                    {fromMe ? 'You: ' : ''}{c.lastMsg?.text || ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Conversation list header
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle:{ fontSize: 22, fontWeight: '900', color: C.white },
  totalUnreadBadge: { borderRadius: 50, paddingHorizontal: 8, paddingVertical: 2, minWidth: 22, alignItems: 'center' },
  totalUnreadText:  { fontSize: 11, fontWeight: '800', color: C.white },
  newBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 50, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { fontSize: 12, fontWeight: '800', color: '#000' },
 
  // Search
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  searchInput:{ flex: 1, color: C.white, fontSize: 14 },
 
  // Conversation rows
  listScroll: { paddingBottom: 40 },
  convRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, position: 'relative' },
  convAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  convAvatar: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  convAvatarText: { fontSize: 18, fontWeight: '900' },
  unreadBadge:{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2 },
  unreadBadgeText: { fontSize: 9, fontWeight: '800', color: C.white },
  convContent:{ flex: 1, gap: 3 },
  convTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName:   { fontSize: 14, fontWeight: '600', color: C.lightGray, flex: 1 },
  convTime:   { fontSize: 10, color: C.gray, marginLeft: 4 },
  rolePill:   { borderRadius: 50, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 1, alignSelf: 'flex-start' },
  rolePillText:{ fontSize: 9, fontWeight: '700' },
  convPreview:{ fontSize: 12, color: C.gray },
 
  // Empty states
  emptyBox:  { alignItems: 'center', gap: 14, paddingTop: 80 },
  emptyTitle:{ fontSize: 18, fontWeight: '800', color: C.white },
  emptySub:  { fontSize: 13, color: C.gray, textAlign: 'center', paddingHorizontal: 30 },
  
  // Thread header
  threadHeader:{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  iconBtn:     { width: 38, height: 38, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  tAvatar:     { width: 40, height: 40, borderRadius: 20, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  tAvatarText: { fontSize: 16, fontWeight: '900' },
  tName:       { fontSize: 15, fontWeight: '800', color: C.white },
  tRole:       { fontSize: 10, fontWeight: '600', marginTop: 2 },
 
  // Thread messages
  threadScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, flexGrow: 1 },
  emptyThread:  { alignItems: 'center', gap: 10, paddingTop: 80 },
  emptyThreadTitle: { fontSize: 22, fontWeight: '900', color: C.white },
  emptyThreadSub:   { fontSize: 13, color: C.gray, textAlign: 'center' },
  dateSep:  { alignItems: 'center', marginVertical: 14 },
  dateSepText: { fontSize: 10, color: C.gray, fontWeight: '700', letterSpacing: 0.5 },
  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgAvatar:{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  bubble:   { borderRadius: 18, padding: 12, borderWidth: 1 },
  bubbleMe: { backgroundColor: '#1A1800', borderColor: C.gold + '44', borderBottomRightRadius: 4 },
  bubbleThem:{ backgroundColor: C.card, borderColor: C.border, borderBottomLeftRadius: 4 },
  bubbleText:{ fontSize: 14, color: C.white, lineHeight: 20 },
  msgMeta:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  msgMetaTime: { fontSize: 9, color: C.gray },
  
  // Input bar
  inputBar: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  textInput:{ flex: 1, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 10, color: C.white, fontSize: 14, maxHeight: 120 },
  sendBtn:  { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
  
  // Compose
  composeHeader:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  composeTitle:      { fontSize: 18, fontWeight: '900', color: C.white },
  composeSearchBox:  { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, height: 46 },
  composeSearchInput:{ flex: 1, color: C.white, fontSize: 14 },
  composeMeta:       { fontSize: 11, color: C.gray, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 16, textTransform: 'uppercase', marginBottom: 4 },
  composeRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  composeAvatar:     { width: 42, height: 42, borderRadius: 21, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  composeAvatarText: { fontSize: 16, fontWeight: '900' },
  composeUserName:   { fontSize: 14, fontWeight: '700', color: C.white },
  composeUserRole:   { fontSize: 11, fontWeight: '600', marginTop: 2 },
  
  // Forum card
  forumCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#0D0D1F', borderRadius: 18,
    borderWidth: 1.5, borderColor: '#6366f155',
    padding: 16, overflow: 'hidden',
  },
  forumCardAccent:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#6366f1', borderRadius: 2 },
  forumCardLeft:      { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  forumCardIconWrap:  { width: 46, height: 46, borderRadius: 23, backgroundColor: '#6366f122', borderWidth: 1.5, borderColor: '#6366f155', justifyContent: 'center', alignItems: 'center' },
  forumCardTitleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  forumCardTitle:     { fontSize: 16, fontWeight: '900', color: '#ffffff' },
  forumCardAllBadge:  { backgroundColor: '#6366f122', borderRadius: 50, borderWidth: 1, borderColor: '#6366f155', paddingHorizontal: 8, paddingVertical: 2 },
  forumCardAllBadgeText: { fontSize: 9, fontWeight: '700', color: '#a5b4fc' },
  forumCardPreview:   { fontSize: 12, color: '#888888' },
  forumUnreadBadge:   { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  forumUnreadBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  
  // Forum divider
  forumDivider:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 4, marginTop: 8 },
  dividerLine2:  { flex: 1, height: 1, backgroundColor: '#2A2A2A' },
  dividerLabel2: { fontSize: 9, color: '#555', fontWeight: '700', letterSpacing: 0.8 },
  
  // Forum thread header
  forumHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' },
  forumHeaderInfo:  { flex: 1 },
  forumHeaderTitle: { fontSize: 16, fontWeight: '900', color: '#ffffff' },
  forumHeaderSub:   { fontSize: 10, color: '#888888', marginTop: 1 },
  forumHeaderBadge: { backgroundColor: '#6366f122', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#6366f155' },
  forumHeaderBadgeText: { fontSize: 11, fontWeight: '700', color: '#a5b4fc' },
  
  // Forum sender row
  forumSenderRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 24, marginTop: 8, marginBottom: 2 },
  forumSenderAvatar:{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  forumSenderName:  { fontSize: 11, fontWeight: '700' },
  forumRolePill:    { borderRadius: 50, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  forumRolePillText:{ fontSize: 8, fontWeight: '700' },
  
  inboxBackBtn: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 4,
  },});