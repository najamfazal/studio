import {
  collection,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead, AppSettings } from "@/lib/types";
import { ContactsPageClient } from "@/components/contacts-page-client";
import { unstable_noStore as noStore } from 'next/cache';

const PAGE_SIZE = 10;

async function getLeads() {
    noStore();
    const leadsRef = collection(db, "leads");

    const queryConstraints = [
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE)
    ];

    const q = query(leadsRef, ...queryConstraints);

    const querySnapshot = await getDocs(q);
    const leads = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Lead)
    );
    const hasMore = leads.length === PAGE_SIZE;

    return { leads, hasMore };
}

async function getAppSettings() {
    noStore();
    const settingsDoc = await getDoc(doc(db, "settings", "appConfig"));
    if (settingsDoc.exists()) {
        return settingsDoc.data() as AppSettings;
    }
    return null;
}


export default async function ContactsPage() {
    const { leads, hasMore } = await getLeads();
    const appSettings = await getAppSettings();

    return (
        <ContactsPageClient 
            initialLeads={JSON.parse(JSON.stringify(leads))} 
            initialAppSettings={appSettings}
            initialHasMore={hasMore}
        />
    );
}
