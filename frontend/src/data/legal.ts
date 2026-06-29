export const legalDocuments = {
  aboutApp: `**About EchoVision**

**Version:** 1.0.0
**Developed by:**
- Akash Kumar
- Lavnish Pandey

**Founders:**
- Akshita Goel
- Lakshita Bhardwaj

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
