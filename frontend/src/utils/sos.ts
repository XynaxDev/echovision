import { Linking, PermissionsAndroid } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const getPrimaryContact = async () => {
   try {
     const stored = await AsyncStorage.getItem("@sos_contacts");
     if (stored) {
       const contacts = JSON.parse(stored);
       const primary = contacts.find((c: any) => c.isPrimary);
       if (primary && primary.number) {
         return { number: primary.number, name: primary.name || "Emergency Services" };
       }
     }
   } catch (e) {}
   return { number: "911", name: "Emergency Services" };
};

export const executeSOS = async () => {
   try {
     const contact = await getPrimaryContact();
     const tel = contact.number;
     
     // Get Location
     let mapsUrl = "Unavailable";
     const { status } = await Location.requestForegroundPermissionsAsync();
     if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        // Round to 5 decimal places (1.1m precision) to keep URL extremely short for single-block SMS
        const lat = location.coords.latitude.toFixed(5);
        const lng = location.coords.longitude.toFixed(5);
        mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
     }
     
     // Get user name for identification
     const auth = require("@react-native-firebase/auth").default;
     const userName = auth().currentUser?.displayName || "User";
     
     // STRICT UCS-2 70-CHARACTER LIMIT
     // 🚨(2) + SOS! Akash needs help! 📍 (26) + URL (~41 max) = ~69 chars
     const smsMessage = `🚨SOS! ${userName} needs help! 📍${mapsUrl}`;
     
     // Send Native Silent SMS
     try {
        const smsGranted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.SEND_SMS);
        if (smsGranted === PermissionsAndroid.RESULTS.GRANTED) {
            // @ts-ignore
            const { SendDirectSms } = require("react-native-send-direct-sms");
            await SendDirectSms(tel, smsMessage);
            console.log("✅ Silent SOS SMS sent successfully!");
        } else {
            console.warn("SMS Permission Denied");
        }
     } catch (smsErr) {
        console.error("❌ Failed to send silent SMS:", smsErr);
     }
     
     // Native Immediate Call
     try {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
           // @ts-ignore
           const RNImmediatePhoneCall = require("react-native-immediate-phone-call").default;
           RNImmediatePhoneCall.immediatePhoneCall(tel);
           console.log("✅ Immediate SOS call started!");
        } else {
           Linking.openURL(`tel:${tel}`);
        }
     } catch (callErr) {
        console.error("❌ Failed to initiate immediate call:", callErr);
        Linking.openURL(`tel:${tel}`); // Fallback
     }
   } catch (e) {
     console.error("SOS Critical Error:", e);
   }
};
