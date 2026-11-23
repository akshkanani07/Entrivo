import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("\n=======================================================");
console.log("      ENTRIVO VAPID KEYS GENERATED SUCCESSFULLY         ");
console.log("=======================================================\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:support@entrivo.com"\n`);
console.log("Copy these into your .env file to enable Web Push notifications.\n");

