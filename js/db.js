import { db } from './firebase-config.js';
import {
    collection, addDoc, query, orderBy, limit,
    getDocs, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * Save a score to Firestore.
 * Stores in:  scores/{autoId}  (global leaderboard doc)
 *             users/{uid}/data  (personal best)
 */
export async function saveScore(uid, displayName, score, level) {
    // 1. Add to global leaderboard collection
    await addDoc(collection(db, 'scores'), {
        uid,
        displayName: displayName || 'Unknown Pilot',
        score,
        level,
        createdAt: serverTimestamp()
    });

    // 2. Update personal best if this score is higher
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists() || score > (snap.data().bestScore ?? 0)) {
        await setDoc(userRef, {
            uid,
            displayName: displayName || 'Unknown Pilot',
            bestScore: score,
            bestLevel: level,
            updatedAt: serverTimestamp()
        }, { merge: true });
    }
}

/** Get personal best score for a user */
export async function getBestScore(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) return snap.data();
    return null;
}

/** Get global top-10 leaderboard */
export async function getLeaderboard() {
    const q = query(collection(db, 'scores'), orderBy('score', 'desc'), limit(10));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
