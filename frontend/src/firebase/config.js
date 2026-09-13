import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBe-d-CAkCQmcxorNVAVhSF35HEOTS83MY",
  authDomain: "nse-stock-app-5d1e3.firebaseapp.com",
  databaseURL: "https://nse-stock-app-5d1e3-default-rtdb.firebaseio.com", // Make sure your database URL is included here!
  projectId: "nse-stock-app-5d1e3",
  storageBucket: "nse-stock-app-5d1e3.firebasestorage.app",
  messagingSenderId: "373421915983",
  appId: "1:373421915983:web:864764fc5b42a06d348f3a"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);