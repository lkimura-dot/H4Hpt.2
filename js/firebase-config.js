// =============================================
//  FIREBASE CONFIGURATION
//  Paste your Firebase project config below.
//  Go to: Firebase Console → Project Settings
//  → Your Apps → Web App → Config object
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ⬇️ REPLACE THIS WITH YOUR OWN FIREBASE CONFIG ⬇️
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
// ⬆️ REPLACE THIS WITH YOUR OWN FIREBASE CONFIG ⬆️

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
