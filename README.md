---
title: NanoTek MacroGen
emoji: 🧪
colorFrom: emerald
colorTo: slate
sdk: docker
pinned: false
---

# NanoTek MacroGen

An interactive, high-precision visual tool to safely build and audit fluidic reaction macros for NanoTek microfluidic systems.

## Features

- **Interactive Fluidic Diagram**: Live visualization of reactor routing, loops, pumps, and current volume capacities.
- **Automated Calculations**: Fast determination of bolus parameters, transfer operations, and safety sweep lines.
- **Safety Audit Guardrails**: Prevents hardware-damaging mistakes like sweep rates running out of sync or loop volumes exceeding capacity limits.
- **Code Explorer & Builder**: Craft, preview, and output robust syntax blocks for direct workspace command execution.

---

## 🚀 Deployment on Hugging Face Spaces

This application is ready to run as a **Hugging Face Docker Space** using a lightweight Nginx web server configured for HF's port requirements.

### Step-by-Step Guide to Deploy

1. **Create a New Space on Hugging Face**:
   - Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **Create new Space**.
   - **Space Name**: Enter `NanoTek_MacroGen` (or any preferred name).
   - **License**: Choose your preferred open-source license (e.g. `mit`).
   - **SDK**: Select **Docker** (important!).
   - **Template**: Choose **Blank** (since we provide the custom Dockerfile and Nginx configuration).
   - **Visibility**: Set to **Public** or **Private** as desired.
   - Click **Create Space**.

2. **Connect and Sync from GitHub**:
   Because you've already pushed your code to GitHub (`https://github.com/giancarlopascali-hub/NanoTek_MacroGen`), you have two easy options to sync the code to your Hugging Face Space:

   #### Option A: Sync via GitHub Actions (Recommended)
   This automatically redeploys your app to Hugging Face whenever you push changes to GitHub.
   - On Hugging Face, go to your Space settings, find the **Hugging Face Token** section, and generate a write-access token (e.g. named `HF_TOKEN`).
   - In your GitHub Repository (`NanoTek_MacroGen`), go to **Settings > Secrets and variables > Actions** and add a secret named `HF_TOKEN` containing your Hugging Face token value.
   - Create a file in your github repo at `.github/workflows/deploy.yml` with the following contents:
     ```yaml
     name: Deploy to Hugging Face Spaces
     on:
       push:
         branches: [ main ]
     jobs:
       deploy:
         runs-on: ubuntu-latest
         steps:
           - uses: actions/checkout@v4
             with:
               fetch-depth: 0
           - name: Push to HF Space Hub
             run: git push --force https://giancarlopascali-hub:${{ secrets.HF_TOKEN }}@huggingface.co/spaces/giancarlopascali-hub/NanoTek_MacroGen main
     ```
     *(Note: Replace `giancarlopascali-hub/NanoTek_MacroGen` in the URL with your Hugging Face username and Space name if different)*.

   #### Option B: Setup directly via Git command line
   Alternatively, add Hugging Face as a second Git remote and push directly:
   ```bash
   # Add the Hugging Face Space repository as a remote
   git remote add hf https://huggingface.co/spaces/YOUR_HF_USERNAME/YOUR_SPACE_NAME

   # Push to Hugging Face (you will be prompted to enter your Hugging Face username and token as the password)
   git push -f hf main
   ```

3. **Build and Run**:
   Once the files (`Dockerfile`, `nginx.conf`, and your repository code) are pushed, Hugging Face will automatically trigger a build container. Over the next 1-2 minutes, it will:
   - Run Vite's production bundler.
   - Package all assets and HTML into a lightweight Nginx layer.
   - Expose the app on port `7860`.
   - Take the app **Live** with a secure HTTPS url!

---

## 🛠️ Local Development

To run the application locally:

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

The app will start at `http://localhost:3000`.
