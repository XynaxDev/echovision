export const legalDocuments = {
  aboutApp: `**About EchoVision**

**Version:** 1.0.0
**Founders:** Akshita Goel, Lakshita Bhardwaj
**Developed by:** Akash Kumar, Lavnish Pandey

EchoVision is an ultra-low-latency, real-time accessibility platform engineered specifically to empower the visually impaired. Built with a deep commitment to independence and inclusivity, it seamlessly merges computer vision, conversational AI, and spatial audio to provide instant environmental awareness. 

Our mission is to transform how users interact with the world around them—making daily navigation, reading, and spatial understanding as effortless as having a personal guide by your side.

**The core architectural philosophy is driven by three pillars:**
• **Zero-Friction Accessibility:** No complex screens. Relying purely on natural haptics, intuitive swipe gestures, and crisp audio.
• **Sub-Second Latency:** Optimizing Time-To-First-Audio-Byte (TTFAB) to deliver conversational speed that feels completely human.
• **Stateless Scalability:** Ensuring absolute privacy by processing environmental data securely without ever storing it.

**Contact Us:** akashkumar.cs27@gmail.com`,

  privacyPolicy: `**Privacy Policy for EchoVision**

*Effective Date: July 1, 2026*

**1. Introduction**
Welcome to EchoVision. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you use our application.

**2. Data Collection**
• **Voice Data:** Your voice queries are temporarily processed by external AI providers (NVIDIA and Deepgram) to provide conversational and transcription services. EchoVision does not store your voice recordings on its servers.
• **Image Data:** Images captured for the Scene Scanner are processed securely and discarded immediately after processing. They are not stored or used to train models.
• **Local Storage:** Your preferences, such as your profile image, language choice, and haptic settings, are stored locally on your device.

**3. External Processors**
We utilize industry-standard, secure third-party processors for core functionality:
• **NVIDIA NIM API** for Vision and Logic AI.
• **Deepgram** for ultra-low latency Speech-to-Text.
• **Sarvam AI** for Text-to-Speech synthesis.

**4. Your Rights**
You have the right to request the deletion of your local data at any time by uninstalling the application or clearing its local storage.

**5. Contact**
For any privacy-related inquiries, please contact the developer at akashkumar.cs27@gmail.com.`,

  termsOfService: `**Terms of Service**

*Effective Date: July 1, 2026*

**1. Acceptance of Terms**
By accessing and using EchoVision, you accept and agree to be bound by the terms and provision of this agreement.

**2. Use of Service**
EchoVision provides AI-driven accessibility tools. While we strive for extreme accuracy, the AI interpretations (Scene Scanner, OCR) should not be relied upon as absolute truth in life-threatening or dangerous situations.

**3. Emergency Services (SOS)**
The SOS feature relies on standard telephony networks and APIs. EchoVision cannot guarantee connection in poor signal areas and should not replace standard emergency protocols.

**4. User Responsibilities**
Users must ensure that the app is used responsibly. Do not use the Scene Scanner to capture sensitive, confidential, or illegal material.

**5. Modifications**
We reserve the right to modify these terms at any time. Continued use of the app constitutes acceptance of new terms.`,

  license: `End-User License Agreement (EULA)

Copyright (c) 2026 Akash Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,

  cookiePolicy: `**Cookie and Local Storage Policy**

EchoVision operates primarily as a mobile application and relies on local device storage rather than traditional web cookies.

**1. Local Storage (AsyncStorage)**
We use React Native AsyncStorage to save your preferences securely on your physical device. This includes:
• **Authentication state** (Firebase token cache).
• **Selected UI Theme** (Dark/Light mode).
• **Haptic and Audio preferences**.
• **Default Emergency (SOS) Contact**.
• **Profile picture URI and Name**.

**2. Tracking and Analytics**
EchoVision does not use third-party tracking pixels, advertising cookies, or behavioral tracking modules. We prioritize your privacy and accessibility over monetization.

**3. Managing Storage**
You can clear all local storage at any time by navigating to your device's App Settings and selecting "Clear Data" for EchoVision.`
};

export const legalDocumentsHi = {
  aboutApp: `**EchoVision के बारे में**

**संस्करण:** 1.0.0
**संस्थापक:** अक्षिता गोयल, लक्षिता भारद्वाज
**डेवलपर्स:** आकाश कुमार, लवनीश पांडे

EchoVision दृष्टिबाधित लोगों को सशक्त बनाने के लिए विशेष रूप से डिज़ाइन किया गया एक अल्ट्रा-लो-लैटेंसी, रियल-टाइम एक्सेसिबिलिटी प्लेटफॉर्म है। स्वतंत्रता और समावेशिता के प्रति गहरी प्रतिबद्धता के साथ निर्मित, यह कंप्यूटर विजन, संवादात्मक AI, और स्थानिक ऑडियो को सहजता से मिलाता है ताकि तत्काल पर्यावरणीय जागरूकता प्रदान की जा सके।

हमारा मिशन यह बदलना है कि उपयोगकर्ता अपने आस-पास की दुनिया के साथ कैसे जुड़ते हैं—दैनिक नेविगेशन, पढ़ने और स्थानिक समझ को उतना ही सहज बनाना जितना कि आपके साथ एक व्यक्तिगत मार्गदर्शक का होना।

**मूल वास्तुकला दर्शन तीन स्तंभों पर संचालित है:**
• **जीरो-फ्रिक्शन एक्सेसिबिलिटी:** कोई जटिल स्क्रीन नहीं। पूरी तरह से प्राकृतिक हैप्टिक्स, सहज स्वाइप जेस्चर और स्पष्ट ऑडियो पर निर्भर करता है।
• **सब-सेकंड लेटेंसी:** संवादात्मक गति प्रदान करने के लिए टाइम-टू-फर्स्ट-ऑडियो-बाइट (TTFAB) को अनुकूलित करना जो पूरी तरह से मानवीय लगता है।
• **स्टेटलेस स्केलेबिलिटी:** पर्यावरणीय डेटा को कभी भी स्टोर किए बिना सुरक्षित रूप से संसाधित करके पूर्ण गोपनीयता सुनिश्चित करना।

**संपर्क करें:** akashkumar.cs27@gmail.com`,

  privacyPolicy: `**EchoVision की प्राइवेसी पॉलिसी**

*प्रभावी तिथि: 1 जुलाई, 2026*

**1. परिचय**
EchoVision में आपका स्वागत है। हम आपकी निजता का सम्मान करते हैं और आपके व्यक्तिगत डेटा की सुरक्षा के लिए प्रतिबद्ध हैं। यह गोपनीयता नीति आपको सूचित करेगी कि जब आप हमारे एप्लिकेशन का उपयोग करते हैं तो हम आपके व्यक्तिगत डेटा की देखभाल कैसे करते हैं।

**2. डेटा संग्रह**
• **वॉयस डेटा:** आपके वॉयस क्वेरीज़ को बाहरी AI प्रदाताओं (NVIDIA और Deepgram) द्वारा संवादात्मक और ट्रांसक्रिप्शन सेवाएं प्रदान करने के लिए अस्थायी रूप से संसाधित किया जाता है। EchoVision आपके वॉयस रिकॉर्डिंग को अपने सर्वर पर संग्रहीत नहीं करता है।
• **इमेज डेटा:** सीन स्कैनर के लिए कैप्चर की गई छवियों को सुरक्षित रूप से संसाधित किया जाता है और प्रसंस्करण के तुरंत बाद हटा दिया जाता है। उनका उपयोग मॉडल को प्रशिक्षित करने के लिए या स्टोर करने के लिए नहीं किया जाता है।
• **लोकल स्टोरेज:** आपकी प्राथमिकताएँ, जैसे आपकी प्रोफ़ाइल छवि, भाषा का चुनाव, और हैप्टिक सेटिंग्स, आपके डिवाइस पर स्थानीय रूप से संग्रहीत की जाती हैं।

**3. बाहरी प्रोसेसर**
हम मुख्य कार्यक्षमता के लिए उद्योग-मानक, सुरक्षित तृतीय-पक्ष प्रोसेसर का उपयोग करते हैं:
• विजन और लॉजिक AI के लिए **NVIDIA NIM API**।
• अल्ट्रा-लो लेटेंसी स्पीच-टू-टेक्स्ट के लिए **Deepgram**।
• टेक्स्ट-टू-स्पीच संश्लेषण के लिए **Sarvam AI**।

**4. आपके अधिकार**
आपके पास एप्लिकेशन को अनइंस्टॉल करके या इसके स्थानीय संग्रहण को साफ़ करके किसी भी समय अपने स्थानीय डेटा को हटाने का अनुरोध करने का अधिकार है।

**5. संपर्क**
निजता से संबंधित किसी भी पूछताछ के लिए, कृपया डेवलपर से akashkumar.cs27@gmail.com पर संपर्क करें।`,

  termsOfService: `**सेवा की शर्तें**

*प्रभावी तिथि: 1 जुलाई, 2026*

**1. शर्तों की स्वीकृति**
EchoVision को एक्सेस और उपयोग करके, आप इस समझौते की शर्तों और प्रावधानों से बाध्य होने के लिए सहमत हैं।

**2. सेवा का उपयोग**
EchoVision AI-संचालित पहुंच उपकरण प्रदान करता है। हालांकि हम अत्यधिक सटीकता के लिए प्रयास करते हैं, AI व्याख्याओं (सीन स्कैनर, OCR) पर जानलेवा या खतरनाक स्थितियों में पूर्ण सत्य के रूप में भरोसा नहीं किया जाना चाहिए।

**3. आपातकालीन सेवाएं (SOS)**
SOS सुविधा मानक टेलीफोनी नेटवर्क और API पर निर्भर करती है। EchoVision खराब सिग्नल वाले क्षेत्रों में कनेक्शन की गारंटी नहीं दे सकता है और इसे मानक आपातकालीन प्रोटोकॉल को प्रतिस्थापित नहीं करना चाहिए।

**4. उपयोगकर्ता की जिम्मेदारियां**
उपयोगकर्ताओं को यह सुनिश्चित करना चाहिए कि ऐप का जिम्मेदारी से उपयोग किया जाए। संवेदनशील, गोपनीय या अवैध सामग्री कैप्चर करने के लिए सीन स्कैनर का उपयोग न करें।

**5. संशोधन**
हम किसी भी समय इन शर्तों को संशोधित करने का अधिकार सुरक्षित रखते हैं। ऐप का निरंतर उपयोग नई शर्तों की स्वीकृति का गठन करता है।`,

  license: `अंतिम-उपयोगकर्ता लाइसेंस समझौता (EULA)

कॉपीराइट (c) 2026 आकाश कुमार

यह सॉफ़्टवेयर और संबंधित दस्तावेज़ फ़ाइलों ("सॉफ़्टवेयर") की एक प्रति प्राप्त करने वाले किसी भी व्यक्ति को नि:शुल्क अनुमति दी जाती है कि वह सॉफ़्टवेयर में बिना किसी प्रतिबंध के काम कर सके, जिसमें सॉफ़्टवेयर की प्रतियां का उपयोग करना, कॉपी करना, संशोधित करना, विलय करना, प्रकाशित करना, वितरित करना, उपलाइसेंस देना और/या बेचना शामिल है, और उन व्यक्तियों को ऐसा करने की अनुमति देना जिन्हें सॉफ़्टवेयर प्रदान किया गया है, निम्नलिखित शर्तों के अधीन:

उपरोक्त कॉपीराइट नोटिस और यह अनुमति नोटिस सॉफ़्टवेयर की सभी प्रतियों या पर्याप्त भागों में शामिल किया जाएगा।

सॉफ़्टवेयर "जैसा है" प्रदान किया जाता है, बिना किसी प्रकार की वारंटी के, व्यक्त या निहित, जिसमें व्यापारिकता, किसी विशेष उद्देश्य के लिए उपयुक्तता और गैर-उल्लंघन की वारंटी शामिल है, लेकिन इन्हीं तक सीमित नहीं है। किसी भी स्थिति में लेखक या कॉपीराइट धारक किसी भी दावे, नुकसान या अन्य दायित्व के लिए उत्तरदायी नहीं होंगे, चाहे वह अनुबंध की कार्रवाई में हो, टॉर्ट में हो या अन्यथा, सॉफ़्टवेयर या सॉफ़्टवेयर के उपयोग या अन्य लेन-देन से उत्पन्न हो।`,

  cookiePolicy: `**कुकी और लोकल स्टोरेज नीति**

EchoVision मुख्य रूप से एक मोबाइल एप्लिकेशन के रूप में कार्य करता है और पारंपरिक वेब कुकीज़ के बजाय स्थानीय डिवाइस संग्रहण पर निर्भर करता है।

**1. लोकल स्टोरेज (AsyncStorage)**
हम आपके भौतिक डिवाइस पर आपकी प्राथमिकताओं को सुरक्षित रूप से सहेजने के लिए React Native AsyncStorage का उपयोग करते हैं। इसमें शामिल हैं:
• **प्रमाणीकरण स्थिति** (Firebase टोकन कैश)।
• **चयनित UI थीम** (डार्क/लाइट मोड)।
• **हैप्टिक और ऑडियो प्राथमिकताएं**।
• **डिफ़ॉल्ट आपातकालीन (SOS) संपर्क**।
• **प्रोफ़ाइल चित्र URI और नाम**।

**2. ट्रैकिंग और एनालिटिक्स**
EchoVision तृतीय-पक्ष ट्रैकिंग पिक्सेल, विज्ञापन कुकीज़ या व्यवहार ट्रैकिंग मॉड्यूल का उपयोग नहीं करता है। हम मुद्रीकरण पर आपकी निजता और पहुंच को प्राथमिकता देते हैं।

**3. स्टोरेज का प्रबंधन**
आप किसी भी समय अपने डिवाइस की ऐप सेटिंग्स पर जाकर और EchoVision के लिए "Clear Data" चुनकर सभी स्थानीय संग्रहण को साफ़ कर सकते हैं।`
};
