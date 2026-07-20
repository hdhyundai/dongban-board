import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = { 
  apiKey: "AIzaSyDw_WQxhF_07Hjhmgb_rfGuOqAE7lDvw00", 
  authDomain: "hd-workspace.firebaseapp.com", 
  projectId: "hd-workspace", 
  storageBucket: "hd-workspace.firebasestorage.app", 
  messagingSenderId: "105147883492", 
  appId: "1:105147883492:web:278e38487300447e4a31f1" 
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
});

// Use fallback if __app_id is not globally available
export const getAppId = () => {
  return 'default-app-id';
};
