# Deploying this backend

## 1. Test it locally first
```
cd backend
npm install
npm start
```
Visit http://localhost:4000/api/picks — you should see mock data.
To test live MLB data:
```
echo "USE_LIVE_DATA=true" > .env
npm start
```
Note: it's currently limited to the first 2 games of the day, 4 hitters per
team, to keep API calls reasonable while testing. Raise `gamesLimit` and
`hittersPerTeam` in server.js once you've confirmed it works reliably.

## 2. Push to GitHub
```
cd backend
git init
git add .
git commit -m "Picks API backend"
```
Create a new repo on GitHub (github.com/new), then:
```
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 3. Deploy on Render (free tier)
1. Go to render.com, sign up/log in
2. Click "New +" → "Blueprint"
3. Connect your GitHub account, select this repo
4. Render will detect render.yaml automatically and configure everything
5. Click "Apply" — it builds and deploys in a few minutes
6. You'll get a URL like https://edgeline-picks-api.onrender.com

Note: Render's free tier spins down after 15 minutes of inactivity and takes
~30-60 seconds to wake back up on the next request. Fine for testing, not
for a real launch — you'd want a paid tier ($7/mo+) once you have real users
so the app doesn't feel slow on first load.

## 4. Point the app at it
In App.js (or wherever you fetch picks), replace:
```js
fetch("http://localhost:4000/api/picks")
```
with:
```js
fetch("https://edgeline-picks-api.onrender.com/api/picks")
```

## Alternative: Railway
Railway (railway.app) works similarly — connect GitHub repo, it
auto-detects Node, deploys automatically. Slightly different free-tier
limits (usage-based credit rather than spin-down), worth comparing once
you're choosing for real.
