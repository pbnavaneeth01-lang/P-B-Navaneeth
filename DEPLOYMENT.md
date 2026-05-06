# Deployment Guide: independent Hosting

This application is designed to be hosted independently of Google AI Studio. 

## Option 1: Vercel (Easiest)
1. Push this code to a GitHub repository.
2. Connect the repository to Vercel.
3. Set the following Environment Variables in Vercel:
   - `OPENAI_API_KEY` (Optional)
   - `ANTHROPIC_API_KEY` (Optional)
   - `GEMINI_API_KEY` (Optional)
4. Vercel will automatically build and deploy your app.

## Option 2: Docker (Any Cloud)
The project includes a `Dockerfile`. You can build and run it anywhere:
```bash
docker build -t grademaster-ai .
docker run -p 3000:3000 grademaster-ai
```

## Option 3: Static Hosting
Since this is a Vite/React app, you can build it locally:
```bash
npm run build
```
Then upload the contents of the `dist/` folder to any static host (Netlify, GitHub Pages, etc.).

## Firebase Setup
Since the app uses Firebase for the database:
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. Replace the contents of `firebase-applet-config.json` with your new project's config.
4. Deploy rules using `firebase-tools`:
   ```bash
   firebase deploy --only firestore:rules
   ```
