import { auth } from './firebase-config.js';
import {
    signInWithPopup,
    GoogleAuthProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut as fbSignOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();

/** Sign in with Google popup */
export async function signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
}

/** Sign in with email + password */
export async function signInWithEmail(email, password) {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
}

/** Register new user with email + password */
export async function registerWithEmail(email, password, displayName) {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
        await updateProfile(result.user, { displayName });
    }
    return result.user;
}

/** Sign out current user */
export async function signOut() {
    await fbSignOut(auth);
}

/** Watch auth state – call cb(user) whenever auth changes */
export function onAuthChange(cb) {
    return onAuthStateChanged(auth, cb);
}
