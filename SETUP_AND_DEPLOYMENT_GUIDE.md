# EchoVision: Setup, API Keys, and Deployment Guide

This document provides a comprehensive guide on how to acquire the necessary API keys, deploy the backend server, generate an installable Android APK, and publish the frontend to the Google Play Store.

---

## Part 1: Acquiring API Keys

The backend requires a few essential API keys to function. You will need to place these inside your `backend/.env` file.

### 1. Google Gemini API Key
Used for Image Analysis (Scene Scanner) and Intent Parsing (Voice Assistant).
* **Where to get it**: [Google AI Studio](https://aistudio.google.com/)
* **How to get it**:
  1. Go to Google AI Studio and sign in with your Google account.
  2. Click on **"Get API key"** in the left sidebar.
  3. Click **"Create API key in new project"** (or select an existing project).
  4. Copy the generated API key.
* **Backend `.env` Variable**: `GEMINI_API_KEY=your_key_here`

### 2. Sarvam AI API Key
Used for highly accurate Indic language Speech-to-Text (STT) and Text-to-Speech (TTS).
* **Where to get it**: [Sarvam AI Platform](https://platform.sarvam.ai/)
* **How to get it**:
  1. Sign up / Log in to the Sarvam AI Platform.
  2. Navigate to the **API Keys** section in your dashboard.
  3. Generate a new API key.
  4. Copy the key.
* **Backend `.env` Variable**: `SARVAM_API_KEY=your_key_here`

---

## Part 2: Backend Deployment

To allow your mobile app to communicate with the backend anywhere in the world, you must deploy the FastAPI backend to a cloud provider.

### Recommended Providers
* **Render** (Easy, has a free tier)
* **Railway** (Very fast setup)
* **Heroku**

### Example: Deploying to Render
1. Push your code to a GitHub repository.
2. Sign up at [Render.com](https://render.com/).
3. Click **New +** and select **Web Service**.
4. Connect your GitHub repository and select the `backend` directory (if deploying a monorepo, set the Root Directory to `backend`).
5. Set the following build settings:
   * **Environment**: `Python`
   * **Build Command**: `pip install uv && uv pip install --system -r pyproject.toml` (or equivalent standard pip install)
   * **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Go to the **Environment** tab and add your keys:
   * `GEMINI_API_KEY`
   * `SARVAM_API_KEY`
7. Click **Deploy**. Once finished, Render will provide a URL (e.g., `https://echovision-backend.onrender.com`).
8. **IMPORTANT**: Update `frontend/src/services/api.ts` to point to this new URL instead of `localhost`.

### Alternative for Local Testing: ngrok (Tunneling)
If you just want to test your local backend on the mobile app or share an APK temporarily:
1. Start your local backend: `uv run uvicorn app.main:app --port 8000`
2. Install [ngrok](https://ngrok.com/) and run: `ngrok http 8000`
3. ngrok will give you a public HTTPS URL (e.g., `https://abcd-123.ngrok-free.app`).
4. Paste this URL into your frontend code (e.g., `frontend/src/services/api.ts`).
5. **Warning:** If you use ngrok's free tier, the URL changes every time you restart ngrok. If the URL changes, any APK you already generated and sent to users will break because it has the old URL hardcoded. The ngrok session must stay open while users are testing.

---

## Part 3: Building an APK for Android (Local Testing)

If you want to create an `.apk` file that you can share with other users directly (sideloading) without going through the Play Store, use Expo Application Services (EAS).

### Prerequisites
1. Create an [Expo Account](https://expo.dev/).
2. Install EAS CLI globally on your machine:
   ```bash
   npm install -g eas-cli
   ```
3. Log in to your Expo account via terminal:
   ```bash
   eas login
   ```

### Generating the APK
1. Open your terminal and navigate to the frontend folder:
   ```bash
   cd d:/eco-vision-app/frontend
   ```
2. Configure the project for EAS Build:
   ```bash
   eas build:configure
   ```
   *Select Android when prompted.* This will create an `eas.json` file.
3. Open the newly created `eas.json` file and modify the `preview` profile to output an `.apk` instead of an `.aab`:
   ```json
   {
     "build": {
       "preview": {
         "android": {
           "buildType": "apk"
         }
       },
       "production": {}
     }
   }
   ```
4. Start the build process:
   ```bash
   eas build -p android --profile preview
   ```
5. Follow the terminal prompts (you can let Expo generate a keystore for you).
6. Wait for the build to finish (this happens in the cloud and may take 10-15 minutes).
7. Once finished, the terminal will provide a **download link**. Download the `.apk` file and send it to your users to install directly on their Android devices.

---

## Part 4: Deploying to Google Play Store

To make the app publicly available on the Play Store, you need to generate an Android App Bundle (`.aab`) and submit it through the Google Play Console.

### Step 1: Create a Google Play Developer Account
1. Go to the [Google Play Console](https://play.google.com/console).
2. Pay the one-time $25 developer registration fee.
3. Verify your identity as required by Google.

### Step 2: Build the Production App Bundle (.aab)
1. Run the production EAS build command:
   ```bash
   eas build -p android --profile production
   ```
2. EAS will generate an `.aab` file (the required format for the Play Store).
3. Download the `.aab` file from the link provided in the terminal.

### Step 3: Publish to Play Console
1. Log in to the Google Play Console.
2. Click **Create app** and fill in your app details (Name: EchoVision, Default language, App or Game: App, Free or Paid: Free).
3. Under the **Production** or **Internal Testing** track, create a new release.
4. Upload your downloaded `.aab` file.
5. Fill out all the required Store Listing details:
   * App description highlighting the accessibility features.
   * High-resolution app icon (512x512).
   * Feature graphic (1024x500).
   * Screenshots of your app.
6. Complete the Content Rating questionnaire and Data Privacy forms (note that your app uses the Camera, Microphone, and Location).
7. Review your release and click **Send for Review**.
8. Wait for Google's review process (can take anywhere from a few hours to a few days). Once approved, your app will be live on the Play Store!
