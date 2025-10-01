import {
  collection,
  getDocs,
  doc,
  query,
  orderBy,
  limit,
  getDoc,
  where,
  Timestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead, AppSettings, LeadStatus } from "@/lib/types";
import { ContactsPageClient } from "@/components/contacts-page-client";
import { unstable_noStore as noStore } from 'next/cache';
import { startOfDay, endOfDay } from "date-fns";

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
    const lastVisible = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
    const hasMore = leads.length === PAGE_SIZE;

    return { leads, lastVisible, hasMore };
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
    const { leads, lastVisible, hasMore } = await getLeads();
    const appSettings = await getAppSettings();

    // Serialize the lastVisible doc
    const serializedLastVisible = lastVisible ? {
        _path: {
            segments: lastVisible.ref.path.split('/')
        },
        _converter: {},
        _firestore: lastVisible.ref.firestore,
        _document: {
            data: {
                value: {
                    mapValue: {
                        fields: lastVisible.data()
                    }
                }
            }
        },
    } : null;


    return (
        <ContactsPageClient 
            initialLeads={JSON.parse(JSON.stringify(leads))} 
            initialAppSettings={appSettings}
            initialHasMore={hasMore}
            initialLastVisible={null} // Firestore docs can't be serialized directly
        />
    );
}
