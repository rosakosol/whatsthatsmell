import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace this config with your own Firebase project config.
// You can find it in the Firebase console under Project Settings → General → "Your apps".
const firebaseConfig = {
  apiKey: "AIzaSyCK7f8Sx3a5_PHW1NYRnsVQVs1c51vfrgs",
  authDomain: "whats-that-smell-86a19.firebaseapp.com",
  projectId: "whats-that-smell-86a19",
  storageBucket: "whats-that-smell-86a19.firebasestorage.app",
  messagingSenderId: "614532188287",
  appId: "1:614532188287:web:0a72bf492243d19796174a",
  measurementId: "G-NCMBMJWR9D"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);